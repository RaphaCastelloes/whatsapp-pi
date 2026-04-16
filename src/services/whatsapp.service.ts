import { 
    makeWASocket,
    DisconnectReason, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys';
import P from 'pino';
import { Boom } from '@hapi/boom';
import qr from 'qrcode-terminal';
import { SessionManager } from './session.manager.js';
import { IncomingMessage, WhatsAppSession, SessionStatus } from '../models/whatsapp.types.js';
import { MessageSender } from './message.sender.js';

export class WhatsAppService {
    private socket: any;
    private sessionManager: SessionManager;
    private messageSender: MessageSender;
    private isReconnecting = false;
    private verboseMode = false;
    private onIncomingMessageRecorded?: (message: IncomingMessage) => void | Promise<void>;
    private saveCreds?: () => Promise<void>;

    constructor(sessionManager: SessionManager) {
        this.sessionManager = sessionManager;
        this.messageSender = new MessageSender(this);
    }

    public getStatus(): SessionStatus {
        return this.sessionManager.getStatus();
    }

    public setIncomingMessageRecorder(callback: (message: IncomingMessage) => void | Promise<void>) {
        this.onIncomingMessageRecorded = callback;
    }

    public getSocket(): any {
        return this.socket;
    }

    public isVerbose(): boolean {
        return this.verboseMode;
    }

    public setVerboseMode(verbose: boolean) {
        this.verboseMode = verbose;
    }

    private normalizeContactNumber(value: string): string {
        if (value.startsWith('+')) {
            return value;
        }

        if (/^\d+$/.test(value)) {
            return `+${value}`;
        }

        return value;
    }

    async start() {
        if (this.isReconnecting) return;
        this.onStatusUpdate?.('| WhatsApp: Connecting...');

        const { state, saveCreds } = await this.sessionManager.getAuthState();
        this.saveCreds = saveCreds;
        const { version } = await fetchLatestBaileysVersion();

        // Cleanup existing socket if any
        if (this.socket) {
            this.socket.ev.removeAllListeners('connection.update');
            this.socket.ev.removeAllListeners('creds.update');
            this.socket.ev.removeAllListeners('messages.upsert');
            try {
                this.socket.end(undefined);
            } catch (e) {}
        }

        const logger = P({ level: this.verboseMode ? 'trace' : 'silent' });
        
        // Suppress Baileys console output during initialization
        const originalConsoleLog = console.log;
        const originalConsoleWarn = console.warn;
        const originalConsoleError = console.error;
        
        if (!this.verboseMode) {
            console.log = () => {};
            console.warn = () => {};
            console.error = () => {};
        }
        
        try {
            this.socket = makeWASocket({
                version,
                printQRInTerminal: false,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, logger),
                },
                syncFullHistory: false,
                logger,
            });
        } catch (error) {
            // Restore console methods even if socket creation fails
            if (!this.verboseMode) {
                console.log = originalConsoleLog;
                console.warn = originalConsoleWarn;
                console.error = originalConsoleError;
            }
            throw error;
        }

        this.socket.ev.on('creds.update', async () => {
            await saveCreds();
            await this.sessionManager.markAuthStateAvailable();
        });

        this.socket.ev.on('connection.update', async (update: any) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                this.sessionManager.setStatus('pairing');
                this.displayQRCode(qr);
                this.onQRCode?.(qr);
                this.onStatusUpdate?.('| WhatsApp: Pairing...');
            }

            if (connection === 'close') {
                const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
                const errorMessage = lastDisconnect?.error?.message || '';
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                const shouldTreatAsLoggedOut =
                    errorMessage.includes('bad-request') ||
                    errorMessage.includes('Bad MAC') ||
                    statusCode === 400 ||
                    statusCode === 401 ||
                    statusCode === DisconnectReason.loggedOut ||
                    statusCode === DisconnectReason.badSession;

                console.error(`Connection closed [${statusCode}]. Reconnecting: ${shouldReconnect}`);

                if (shouldTreatAsLoggedOut) {
                    console.error(`Session invalid or logged out [${statusCode}] - preserving auth state and requiring re-auth`);
                    if (errorMessage.includes('Bad MAC')) {
                        console.error('[WhatsApp-Pi] Bad MAC error detected. Your session keys are corrupted.');
                        console.error('[WhatsApp-Pi] Run /whatsapp-logout to clear auth state, then reconnect with /whatsapp-connect');
                        this.onStatusUpdate?.('| WhatsApp: Session Error (Bad MAC)');
                    }
                    this.sessionManager.setStatus('logged-out');
                    if (!errorMessage.includes('Bad MAC')) {
                        this.onStatusUpdate?.('| WhatsApp: Logged out');
                    }
                    return;
                }

                if (statusCode === DisconnectReason.connectionReplaced) {
                    console.error('Connection replaced - another instance connected');
                    this.onStatusUpdate?.('| WhatsApp: Conflict (Another Instance)');
                    return;
                }
                
                if (shouldReconnect && !this.isReconnecting) {
                    this.isReconnecting = true;
                    this.onStatusUpdate?.('| WhatsApp: Reconnecting...');
                    setTimeout(() => {
                        this.isReconnecting = false;
                        this.start();
                    }, 3000);
                } else if (!shouldReconnect) {
                    this.sessionManager.setStatus('logged-out');
                    this.onStatusUpdate?.('| WhatsApp: Disconnected');
                }
            } else if (connection === 'open') {
                if (this.verboseMode) {
                    console.log('WhatsApp connection successfully opened');
                }
                this.isReconnecting = false;
                await this.saveCreds?.();
                await this.sessionManager.markAuthStateAvailable();
                this.sessionManager.setStatus('connected');
                this.onStatusUpdate?.('| WhatsApp: Connected');
            }
        });

        this.socket.ev.on('messages.upsert', (m: any) => this.handleIncomingMessages(m));

        // Restore console methods after socket creation
        if (!this.verboseMode) {
            console.log = originalConsoleLog;
            console.warn = originalConsoleWarn;
            console.error = originalConsoleError;
        }
    }

    public async handleIncomingMessages(m: any) {
        if (this.sessionManager.getStatus() !== 'connected') return;
        const msg = m.messages[0];

        // msg.key.fromMe is always allowed
        if (!msg || !msg.key.remoteJid) return;

        // Ignore messages sent by Pi (marked with π)
        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
        if (text.endsWith('π')) return;

        const remoteJid = msg.key.remoteJid;
        if (remoteJid.endsWith('@g.us')) return;

        const senderJid = this.normalizeContactNumber(remoteJid.split('@')[0]);

        void Promise.resolve(this.onIncomingMessageRecorded?.({
            id: msg.key.id,
            remoteJid,
            pushName: msg.pushName || undefined,
            text,
            timestamp: typeof msg.messageTimestamp === 'number' ? Number(msg.messageTimestamp) : Date.now()
        })).catch(error => {
            if (this.verboseMode) {
                console.error('Failed to record recent message:', error);
            }
        });
        
        if (this.sessionManager.isBlocked(senderJid)) {
            if (this.isVerbose()) {
                console.log(`Ignoring message from ${senderJid} (explicitly blocked)`);
            }
            return;
        }

        if (!this.sessionManager.isAllowed(senderJid)) {
            if (this.isVerbose()) {
                console.log(`Ignoring message from ${senderJid} (not in allow list)`);
            }
            // Track this number as ignored so user can allow it later
            const pushName = msg.pushName || undefined;
            await this.sessionManager.trackIgnoredNumber(senderJid, pushName);
            return;
        }

        this.lastRemoteJid = msg.key.remoteJid;
        this.onMessage?.(m);
    }

    private onQRCode?: (qr: string) => void;
    private onMessage?: (m: any) => void;
    private onStatusUpdate?: (status: string) => void;
    private lastRemoteJid: string | null = null;

    setQRCodeCallback(callback: (qr: string) => void) {
        this.onQRCode = callback;
    }

    setMessageCallback(callback: (m: any) => void) {
        this.onMessage = callback;
    }

    setStatusCallback(callback: (status: string) => void) {
        this.onStatusUpdate = callback;
    }

    private displayQRCode(qrData: string): void {
        // Clear screen and show QR code with instructions
        console.clear();
        
        console.log('');
        console.log('WhatsApp: Pairing...');
        console.log('Scan this QR code with your WhatsApp mobile app:');
        console.log('');
        
        // Display QR code
        qr.generate(qrData, { small: true });
        
        console.log('');
        console.log('1. Open WhatsApp on your phone');
        console.log('2. Go to Settings > Linked Devices');
        console.log('3. Tap "Link a device"');
        console.log('4. Point your camera at this QR code');
        console.log('');
        console.log('QR code will refresh automatically if it expires.');
        console.log('');
    }

    public getLastRemoteJid(): string | null {
        return this.lastRemoteJid;
    }

    async sendMessage(jid: string, text: string) {
        // Ensure we show the typing indicator before sending
        await this.sendPresence(jid, 'composing');

        const result = await this.messageSender.send({
            recipientJid: jid,
            text: text
        });

        // After sending, we can stop the typing indicator
        await this.sendPresence(jid, 'paused');

        if (!result.success) {
            console.error(`Failed to send message to ${jid}: ${result.error}`);
        }
        
        return result;
    }

    private normalizeRecipientJid(jid: string): string {
        if (jid.includes('@')) return jid;
        const digits = jid.startsWith('+') ? jid.slice(1) : jid;
        return `${digits}@s.whatsapp.net`;
    }

    async sendMenuMessage(jid: string, text: string) {
        const normalizedJid = this.normalizeRecipientJid(jid);

        if (!this.socket || this.getStatus() !== 'connected') {
            return {
                success: false,
                error: 'WhatsApp is not connected',
                attempts: 0
            };
        }

        try {
            await this.sendPresence(normalizedJid, 'composing');
            const response = await this.socket.sendMessage(normalizedJid, { text });
            await this.sendPresence(normalizedJid, 'paused');

            return {
                success: true,
                messageId: response?.key?.id,
                attempts: 1
            };
        } catch (error: any) {
            await this.sendPresence(normalizedJid, 'paused');
            console.error(`Failed to send menu message to ${normalizedJid}:`, error);
            return {
                success: false,
                error: error?.message || 'Unknown error',
                attempts: 1
            };
        }
    }

    async sendPresence(jid: string, presence: 'composing' | 'recording' | 'paused') {
        if (!this.socket || this.getStatus() !== 'connected') return;
        try {
            await this.socket.sendPresenceUpdate(presence, jid);
        } catch (error) {
            if (this.verboseMode) {
                console.error(`Failed to send presence update to ${jid}:`, error);
            }
        }
    }

    async markRead(jid: string, messageId: string, fromMe: boolean = false) {
        if (!this.socket || this.getStatus() !== 'connected') return;
        try {
            await this.socket.readMessages([{ remoteJid: jid, id: messageId, fromMe }]);
        } catch (error) {
            if (this.verboseMode) {
                console.error(`Failed to mark message as read:`, error);
            }
        }
    }

    async logout() {
        await this.socket?.logout();
        await this.sessionManager.deleteAuthState();
    }

    async stop() {
        try {
            await this.saveCreds?.();
        } catch (error) {
            if (this.verboseMode) {
                console.error('Failed to persist auth state during stop:', error);
            }
        }

        if (this.socket) {
            this.socket.ev.removeAllListeners('connection.update');
            this.socket.ev.removeAllListeners('creds.update');
            this.socket.ev.removeAllListeners('messages.upsert');
            try {
                this.socket.end(undefined);
            } catch (e) {}
            this.socket = undefined;
            this.isReconnecting = false;
        }
        await this.sessionManager.setStatus('disconnected');
        this.onStatusUpdate?.('| WhatsApp: Disconnected');
    }
}
