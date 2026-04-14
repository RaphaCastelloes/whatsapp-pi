import { 
    makeWASocket,
    DisconnectReason, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys';
import P from 'pino';
import { Boom } from '@hapi/boom';
import { SessionManager } from './session.manager.js';
import { WhatsAppSession, SessionStatus } from '../models/whatsapp.types.js';
import { MessageSender } from './message.sender.js';

export class WhatsAppService {
    private socket: any;
    private sessionManager: SessionManager;
    private messageSender: MessageSender;
    private isReconnecting = false;
    private verboseMode = false;

    constructor(sessionManager: SessionManager) {
        this.sessionManager = sessionManager;
        this.messageSender = new MessageSender(this);
    }

    public getStatus(): SessionStatus {
        return this.sessionManager.getStatus();
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

    async start() {
        if (this.isReconnecting) return;
        this.onStatusUpdate?.('WhatsApp: Connecting...');

        const { state, saveCreds } = await this.sessionManager.getAuthState();
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
        
        this.socket = makeWASocket({
            version,
            printQRInTerminal: false,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            logger,
        });

        this.socket.ev.on('creds.update', saveCreds);

        this.socket.ev.on('connection.update', async (update: any) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                this.sessionManager.setStatus('pairing');
                this.onQRCode?.(qr);
                this.onStatusUpdate?.('WhatsApp: Pairing...');
            }

            if (connection === 'close') {
                const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
                const errorMessage = lastDisconnect?.error?.message || '';
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                
                console.error(`Connection closed [${statusCode}]. Reconnecting: ${shouldReconnect}`);
                
                if (
                    errorMessage.includes('bad-request') || 
                    statusCode === 400 || 
                    statusCode === 401 || 
                    statusCode === DisconnectReason.loggedOut ||
                    statusCode === DisconnectReason.badSession
                ) {
                    console.error(`Session invalid or logged out [${statusCode}] - clearing session and forcing re-auth`);
                    await this.sessionManager.clearSession();
                    this.sessionManager.setStatus('logged-out');
                    this.onStatusUpdate?.('WhatsApp: Logged out');
                    return;
                }

                if (statusCode === DisconnectReason.connectionReplaced) {
                    console.error('Connection replaced - another instance connected');
                    this.onStatusUpdate?.('WhatsApp: Conflict (Another Instance)');
                    return;
                }
                
                if (shouldReconnect && !this.isReconnecting) {
                    this.isReconnecting = true;
                    this.onStatusUpdate?.('WhatsApp: Reconnecting...');
                    setTimeout(() => {
                        this.isReconnecting = false;
                        this.start();
                    }, 3000);
                } else if (!shouldReconnect) {
                    this.sessionManager.setStatus('logged-out');
                    this.onStatusUpdate?.('WhatsApp: Disconnected');
                }
            } else if (connection === 'open') {
                if (this.verboseMode) {
                    console.log('WhatsApp connection successfully opened');
                }
                this.isReconnecting = false;
                this.sessionManager.setStatus('connected');
                this.onStatusUpdate?.('WhatsApp: Connected');
            }
        });

        this.socket.ev.on('messages.upsert', (m: any) => this.handleIncomingMessages(m));
    }

    public async handleIncomingMessages(m: any) {
        if (this.sessionManager.getStatus() !== 'connected') return;
        const msg = m.messages[0];

        // msg.key.fromMe is always allowed
        if (!msg || !msg.key.remoteJid) return;

        // Ignore messages sent by Pi (marked with π)
        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
        if (text.endsWith('π')) return;

        const senderJid = msg.key.remoteJid.split('@')[0];
        
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
        await this.sessionManager.clearSession();
    }

    async stop() {
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
        this.onStatusUpdate?.('WhatsApp: Disconnected');
    }
}
