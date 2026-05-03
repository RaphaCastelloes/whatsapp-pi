import {
    makeWASocket,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys';
import P from 'pino';
import { SessionManager } from './session.manager.js';
import { IncomingMessage, SessionStatus } from '../models/whatsapp.types.js';
import { MessageSender } from './message.sender.js';
import { installBaileysConsoleFilter } from './baileys-console-filter.js';

export interface WhatsAppStartOptions {
    allowPairingOnAuthFailure?: boolean;
}

interface DisconnectPayload {
    error?: unknown;
}

interface ConnectionUpdateEvent {
    connection?: 'close' | 'open' | string;
    lastDisconnect?: DisconnectPayload;
    qr?: string;
}

interface IncomingMessageKey {
    id?: string;
    remoteJid?: string;
    fromMe?: boolean;
}

interface IncomingMessageContent {
    conversation?: string;
    extendedTextMessage?: { text?: string };
}

interface IncomingMessageLike {
    key: IncomingMessageKey;
    message?: IncomingMessageContent;
    pushName?: string;
    messageTimestamp?: number | string;
}

interface MessagesUpsertEvent {
    messages?: IncomingMessageLike[];
}

interface WhatsAppSocketLike {
    ev: {
        on(event: 'connection.update', handler: (update: ConnectionUpdateEvent) => void | Promise<void>): void;
        on(event: 'creds.update', handler: () => void | Promise<void>): void;
        on(event: 'messages.upsert', handler: (payload: MessagesUpsertEvent) => void | Promise<void>): void;
        removeAllListeners(event: 'connection.update' | 'creds.update' | 'messages.upsert'): void;
    };
    end(reason?: unknown): void;
    logout(): Promise<void>;
    sendMessage(jid: string, content: { text: string }): Promise<{ key?: { id?: string } } | undefined>;
    sendPresenceUpdate(presence: 'composing' | 'recording' | 'paused', jid: string): Promise<void>;
    readMessages(messages: Array<{ remoteJid: string; id: string; fromMe: boolean }>): Promise<void>;
}

interface LastDisconnectLike {
    error?: unknown;
}

interface BoomLikeError {
    output?: {
        statusCode?: number;
    };
    message?: string;
}

export class WhatsAppService {
    private socket?: WhatsAppSocketLike;
    private sessionManager: SessionManager;
    private messageSender: MessageSender;
    private isReconnecting = false;
    private verboseMode = false;
    private onIncomingMessageRecorded?: (message: IncomingMessage) => void | Promise<void>;
    private saveCreds?: () => Promise<void>;
    private restoreBaileysConsoleFilter?: () => void;
    private reconnectTimeout?: ReturnType<typeof setTimeout>;
    private onQRCode?: (qr: string) => void;
    private onMessage?: (m: MessagesUpsertEvent) => void;
    private onStatusUpdate?: (status: string) => void;
    private lastRemoteJid: string | null = null;

    constructor(sessionManager: SessionManager) {
        this.sessionManager = sessionManager;
        this.messageSender = new MessageSender(this);
    }

    public getStatus(): SessionStatus {
        return this.sessionManager.getStatus();
    }

    public getEffectiveStatus(): SessionStatus {
        const status = this.sessionManager.getStatus();
        if (status === 'connected' && !this.socket) {
            return 'disconnected';
        }

        return status;
    }

    public setIncomingMessageRecorder(callback: (message: IncomingMessage) => void | Promise<void>) {
        this.onIncomingMessageRecorded = callback;
    }

    public getSocket(): WhatsAppSocketLike | undefined {
        return this.socket;
    }

    public isVerbose(): boolean {
        return this.verboseMode;
    }

    public setVerboseMode(verbose: boolean) {
        this.verboseMode = verbose;
        if (verbose) {
            this.restoreBaileysConsoleFilter?.();
            this.restoreBaileysConsoleFilter = undefined;
        }
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

    private normalizeRecipientJid(jid: string): string {
        if (jid.includes('@')) return jid;
        const digits = jid.startsWith('+') ? jid.slice(1) : jid;
        return `${digits}@s.whatsapp.net`;
    }

    private getDisconnectStatusCode(error: unknown): number | undefined {
        if (!error || typeof error !== 'object') {
            return undefined;
        }

        const candidate = error as BoomLikeError;
        return candidate.output?.statusCode;
    }

    private getErrorMessage(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }

        if (typeof error === 'object' && error !== null && 'message' in error) {
            const candidate = error as { message?: unknown };
            return typeof candidate.message === 'string' ? candidate.message : '';
        }

        return '';
    }

    private clearReconnectTimeout() {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = undefined;
        }
    }

    private cleanupSocket() {
        this.clearReconnectTimeout();

        if (!this.socket) {
            return;
        }

        this.restoreBaileysConsoleFilter?.();
        this.restoreBaileysConsoleFilter = undefined;
        this.socket.ev.removeAllListeners('connection.update');
        this.socket.ev.removeAllListeners('creds.update');
        this.socket.ev.removeAllListeners('messages.upsert');

        try {
            this.socket.end(undefined);
        } catch {
            // Best-effort cleanup
        }

        this.socket = undefined;
    }

    private setSocket(socket: WhatsAppSocketLike) {
        this.socket = socket;
    }

    private registerSocketListeners(socket: WhatsAppSocketLike, options: WhatsAppStartOptions, saveCreds: () => Promise<void>) {
        socket.ev.on('creds.update', async () => {
            await saveCreds();
            await this.sessionManager.markAuthStateAvailable();
        });

        socket.ev.on('connection.update', async (update) => {
            await this.handleConnectionUpdate(update, options);
        });

        socket.ev.on('messages.upsert', (payload) => {
            void this.handleIncomingMessages(payload);
        });
    }

    private async createSocket(): Promise<WhatsAppSocketLike> {
        const { state, saveCreds } = await this.sessionManager.getAuthState();
        this.saveCreds = saveCreds;
        const { version } = await fetchLatestBaileysVersion();

        const logger = P({ level: this.verboseMode ? 'trace' : 'silent' });

        const socket = makeWASocket({
            version,
            printQRInTerminal: false,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger)
            },
            syncFullHistory: false,
            logger
        }) as WhatsAppSocketLike;

        return socket;
    }

    async start(options: WhatsAppStartOptions = {}) {
        if (this.isReconnecting) return;
        this.onStatusUpdate?.('| WhatsApp: Connecting...');

        this.cleanupSocket();

        const originalConsoleLog = console.log;
        const originalConsoleWarn = console.warn;
        const originalConsoleError = console.error;
        let socketInitialized = false;

        if (!this.verboseMode) {
            console.log = () => {};
            console.warn = () => {};
            console.error = () => {};
        }

        try {
            const socket = await this.createSocket();
            this.setSocket(socket);
            this.registerSocketListeners(socket, options, this.saveCreds ?? (async () => {}));
            socketInitialized = true;
        } catch (error) {
            if (!this.verboseMode) {
                console.log = originalConsoleLog;
                console.warn = originalConsoleWarn;
                console.error = originalConsoleError;
            }
            throw error;
        } finally {
            if (!this.verboseMode) {
                console.log = originalConsoleLog;
                console.warn = originalConsoleWarn;
                console.error = originalConsoleError;
                if (socketInitialized) {
                    this.restoreBaileysConsoleFilter = installBaileysConsoleFilter(this.verboseMode);
                }
            }
        }
    }

    private async handleConnectionUpdate(update: ConnectionUpdateEvent, options: WhatsAppStartOptions) {
        const { connection, lastDisconnect, qr } = update;
        const allowPairingOnAuthFailure = options.allowPairingOnAuthFailure ?? true;

        if (qr) {
            await this.handlePairingQr(qr);
        }

        if (connection === 'close') {
            await this.handleConnectionClosed(lastDisconnect, allowPairingOnAuthFailure, options);
            return;
        }

        if (connection === 'open') {
            await this.handleConnectionOpen();
        }
    }

    private async handlePairingQr(qr: string) {
        this.sessionManager.setStatus('pairing');
        this.onQRCode?.(qr);
        this.onStatusUpdate?.('| WhatsApp: Disconnected');
    }

    private async handleConnectionOpen() {
        if (this.verboseMode) {
            console.log('WhatsApp connection successfully opened');
        }

        this.isReconnecting = false;
        this.clearReconnectTimeout();
        await this.saveCreds?.();
        await this.sessionManager.markAuthStateAvailable();
        this.sessionManager.setStatus('connected');
        this.onStatusUpdate?.('| WhatsApp: Connected');
    }

    private isBadMacError(errorMessage: string): boolean {
        return errorMessage.includes('Bad MAC');
    }

    private isAuthRejected(statusCode: number | undefined, errorMessage: string): boolean {
        return errorMessage.includes('bad-request')
            || statusCode === 400
            || statusCode === 401
            || statusCode === DisconnectReason.loggedOut
            || statusCode === DisconnectReason.badSession;
    }

    private async handleConnectionClosed(
        lastDisconnect: LastDisconnectLike | undefined,
        allowPairingOnAuthFailure: boolean,
        options: WhatsAppStartOptions
    ) {
        const statusCode = this.getDisconnectStatusCode(lastDisconnect?.error);
        const errorMessage = this.getErrorMessage(lastDisconnect?.error);
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        const isBadMac = this.isBadMacError(errorMessage);
        const isAuthRejected = this.isAuthRejected(statusCode, errorMessage);
        const shouldTreatAsLoggedOut = isBadMac || isAuthRejected;

        if (this.verboseMode) {
            console.error(`Connection closed [${statusCode}]. Reconnecting: ${shouldReconnect}`);
        }

        if (shouldTreatAsLoggedOut) {
            if (this.verboseMode) {
                console.error(`Session rejected [${statusCode}] - preserving auth state`);
            }
            if (isBadMac) {
                if (this.verboseMode) {
                    console.error('[WhatsApp-Pi] Bad MAC error detected. Your session keys are corrupted.');
                    console.error('[WhatsApp-Pi] Use Logoff (Delete Session) only if reconnect keeps failing.');
                }
                this.onStatusUpdate?.('| WhatsApp: Session Error (Bad MAC)');
            } else if (isAuthRejected && allowPairingOnAuthFailure) {
                this.onStatusUpdate?.('| WhatsApp: Session Preserved (Reconnect Failed)');
            }
            this.cleanupSocket();
            this.isReconnecting = false;
            await this.sessionManager.setStatus('disconnected');
            if (!isBadMac) {
                this.onStatusUpdate?.('| WhatsApp: Disconnected');
            }
            return;
        }

        if (statusCode === DisconnectReason.connectionReplaced) {
            if (this.verboseMode) {
                console.error('Connection replaced - another instance connected');
            }
            this.onStatusUpdate?.('| WhatsApp: Conflict (Another Instance)');
            return;
        }

        if (shouldReconnect && !this.isReconnecting) {
            this.isReconnecting = true;
            this.onStatusUpdate?.('| WhatsApp: Reconnecting...');
            this.clearReconnectTimeout();
            this.reconnectTimeout = setTimeout(() => {
                this.isReconnecting = false;
                void this.start(options);
            }, 3000);
        } else if (!shouldReconnect) {
            this.sessionManager.setStatus('logged-out');
            this.onStatusUpdate?.('| WhatsApp: Disconnected');
        }
    }

    private extractText(message: IncomingMessageContent | undefined): string {
        return message?.conversation || message?.extendedTextMessage?.text || '';
    }

    private isPiGeneratedMessage(text: string): boolean {
        return text.endsWith('π');
    }

    private getIncomingTimestamp(timestamp: number | string | undefined): number {
        if (typeof timestamp === 'number') {
            return timestamp;
        }

        if (typeof timestamp === 'string') {
            const parsed = Number(timestamp);
            return Number.isFinite(parsed) ? parsed : Date.now();
        }

        return Date.now();
    }

    private async recordIncomingMessage(message: IncomingMessageLike, remoteJid: string, text: string) {
        void Promise.resolve(this.onIncomingMessageRecorded?.({
            id: message.key.id ?? remoteJid,
            remoteJid,
            pushName: message.pushName || undefined,
            text,
            timestamp: this.getIncomingTimestamp(message.messageTimestamp)
        })).catch(error => {
            if (this.verboseMode) {
                console.error('Failed to record recent message:', error);
            }
        });
    }

    public async handleIncomingMessages(payload: MessagesUpsertEvent) {
        if (this.sessionManager.getStatus() !== 'connected') return;

        const message = payload.messages?.[0];
        if (!message || !message.key.remoteJid) return;

        const text = this.extractText(message.message);
        if (this.isPiGeneratedMessage(text)) return;

        const remoteJid = message.key.remoteJid;
        if (remoteJid.endsWith('@g.us')) return;

        const senderJid = this.normalizeContactNumber(remoteJid.split('@')[0]);
        void this.recordIncomingMessage(message, remoteJid, text);

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
            const pushName = message.pushName || undefined;
            await this.sessionManager.trackIgnoredNumber(senderJid, pushName);
            return;
        }

        this.lastRemoteJid = remoteJid;
        this.onMessage?.(payload);
    }

    setQRCodeCallback(callback: (qr: string) => void) {
        this.onQRCode = callback;
    }

    setMessageCallback(callback: (m: MessagesUpsertEvent) => void) {
        this.onMessage = callback;
    }

    setStatusCallback(callback: (status: string) => void) {
        this.onStatusUpdate = callback;
    }

    public getLastRemoteJid(): string | null {
        return this.lastRemoteJid;
    }

    private getActiveSocket(): WhatsAppSocketLike | null {
        if (!this.socket || this.getStatus() !== 'connected') {
            return null;
        }

        return this.socket;
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

    async sendMenuMessage(jid: string, text: string) {
        const normalizedJid = this.normalizeRecipientJid(jid);
        const socket = this.getActiveSocket();

        if (!socket) {
            return {
                success: false,
                error: 'WhatsApp is not connected',
                attempts: 0
            };
        }

        try {
            await this.sendPresence(normalizedJid, 'composing');
            const response = await socket.sendMessage(normalizedJid, { text });
            await this.sendPresence(normalizedJid, 'paused');

            return {
                success: true,
                messageId: response?.key?.id,
                attempts: 1
            };
        } catch (error: unknown) {
            await this.sendPresence(normalizedJid, 'paused');
            console.error(`Failed to send menu message to ${normalizedJid}:`, error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                attempts: 1
            };
        }
    }

    async sendPresence(jid: string, presence: 'composing' | 'recording' | 'paused') {
        const socket = this.getActiveSocket();
        if (!socket) return;
        try {
            await socket.sendPresenceUpdate(presence, jid);
        } catch (error) {
            if (this.verboseMode) {
                console.error(`Failed to send presence update to ${jid}:`, error);
            }
        }
    }

    async markRead(jid: string, messageId: string, fromMe: boolean = false) {
        const socket = this.getActiveSocket();
        if (!socket) return;
        try {
            await socket.readMessages([{ remoteJid: jid, id: messageId, fromMe }]);
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

        this.cleanupSocket();
        this.isReconnecting = false;
        await this.sessionManager.setStatus('disconnected');
        this.onStatusUpdate?.('| WhatsApp: Disconnected');
    }
}
