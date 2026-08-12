import {
    makeWASocket,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} from 'baileys';
import P from 'pino';
import { SessionManager } from './session.manager.js';
import { IncomingMessage, SessionStatus } from '../models/whatsapp.types.js';
import { MessageSender } from './message.sender.js';
import { installBaileysConsoleFilter } from './baileys-console-filter.js';
import { t } from '../i18n.js';
import { appendFileSync } from 'fs';
import { createStoragePaths } from './storage-path.js';
import { extractIncomingText } from './incoming-message.resolver.js';
import type { RecentsService } from './recents.service.js';

const LOG_FILE = createStoragePaths().logPath;
function fileLog(msg: string) {
    try { appendFileSync(LOG_FILE, `[${new Date().toISOString()}] [WhatsApp-Pi] ${msg}\n`); } catch {
        // File logging is best-effort.
    }
}

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
    receivedPendingNotifications?: boolean;
    isOnline?: boolean;
    isNewLogin: boolean | undefined;
}

interface IncomingMessageKey {
    id?: string;
    remoteJid?: string;
    fromMe?: boolean;
    participant?: string;
}

interface IncomingMessageContextInfo {
    mentionedJid?: string[];
    quotedMessage?: IncomingMessageContent;
    participant?: string;
    stanzaId?: string;
    remoteJid?: string;
}

interface IncomingMessageWithContext {
    contextInfo?: IncomingMessageContextInfo;
}

interface IncomingMessageContent {
    conversation?: string;
    extendedTextMessage?: {
        text?: string;
        contextInfo?: IncomingMessageContextInfo;
    };
    imageMessage?: IncomingMessageWithContext;
    videoMessage?: IncomingMessageWithContext;
    documentMessage?: IncomingMessageWithContext;
    audioMessage?: IncomingMessageWithContext;
    stickerMessage?: IncomingMessageWithContext;
    buttonsMessage?: IncomingMessageWithContext;
    templateMessage?: IncomingMessageWithContext;
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
    user?: { id?: string; lid?: string };
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
    groupMetadata(jid: string): Promise<{ id: string; subject: string; participants: Array<{ id: string }> }>;
    groupFetchAllParticipating(): Promise<Record<string, { id: string; subject: string; participants: Array<{ id: string }> }>>;
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
    private static readonly INITIAL_RECONNECT_DELAY_MS = 5_000;
    private static readonly MAX_RECONNECT_DELAY_MS = 120_000;

    private socket?: WhatsAppSocketLike;
    private sessionManager: SessionManager;
    private recentsService?: RecentsService;
    private messageSender: MessageSender;
    private isReconnecting = false;
    private reconnectAttempts = 0;
    private verboseMode = false;
    private onIncomingMessageRecorded?: (message: IncomingMessage) => void | Promise<void>;
    private saveCreds?: () => Promise<void>;
    private restoreBaileysConsoleFilter?: () => void;
    private reconnectTimeout?: ReturnType<typeof setTimeout>;
    private intentionalStop = false;
    private onQRCode?: (qr: string) => void;
    private onMessage?: (m: MessagesUpsertEvent) => void;
    private onStatusUpdate?: (status: string) => void;
    private lastRemoteJid: string | null = null;
    private qrWasShown = false;
    private boundGroupJid: string | null = null;
    private groupMetadataCache: Map<string, { id: string; subject: string; participants: Array<{ id: string }> }> = new Map();

    constructor(sessionManager: SessionManager) {
        this.sessionManager = sessionManager;
        this.messageSender = new MessageSender(this);
    }

    public setRecentsService(recentsService: RecentsService) {
        this.recentsService = recentsService;
    }

    public setGroupBinding(groupJid: string) {
        this.boundGroupJid = groupJid;
    }

    public getBoundGroupJid(): string | null {
        return this.boundGroupJid;
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

    public resolveOutboundRecipientJid(recipient: string): string {
        if (SessionManager.isGroupJid(recipient)) {
            return recipient;
        }

        const senderNumber = this.normalizeContactNumber(recipient.split('@')[0]);
        const allowedContact = this.sessionManager.getAllowedContact(recipient)
            ?? this.sessionManager.getAllowedContact(senderNumber);

        if (allowedContact?.sendNumber) {
            return this.normalizeRecipientJid(allowedContact.sendNumber);
        }

        return this.normalizeRecipientJid(recipient);
    }

    private normalizeJidForComparison(jid: string): string {
        const [localPart, domain = ''] = jid.split('@');
        const normalizedLocal = localPart.split(':')[0];
        return domain ? `${normalizedLocal}@${domain}` : normalizedLocal;
    }

    private normalizeJidIdentity(jid: string): string {
        return this.normalizeJidForComparison(jid).split('@')[0];
    }

    private getAgentJidCandidates(): string[] {
        const user = this.socket?.user;
        const rawJids = [user?.id, user?.lid].filter((jid): jid is string => Boolean(jid));
        const candidates = new Set<string>();

        for (const jid of rawJids) {
            const normalized = this.normalizeJidForComparison(jid);
            candidates.add(normalized);
            candidates.add(this.normalizeJidIdentity(jid));
        }

        return [...candidates];
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

    private getReconnectDelayMs(): number {
        const delay = WhatsAppService.INITIAL_RECONNECT_DELAY_MS * (2 ** Math.max(0, this.reconnectAttempts - 1));
        return Math.min(delay, WhatsAppService.MAX_RECONNECT_DELAY_MS);
    }

    private scheduleReconnect(options: WhatsAppStartOptions) {
        if (this.intentionalStop) {
            fileLog('[scheduleReconnect] Skipping - intentional stop');
            return;
        }

        if (this.isReconnecting) {
            fileLog('[scheduleReconnect] Already reconnecting, skipping duplicate schedule');
            return;
        }

        this.isReconnecting = true;
        this.reconnectAttempts++;
        const delay = this.getReconnectDelayMs();
        
        fileLog(`[scheduleReconnect] Scheduling reconnect attempt #${this.reconnectAttempts} in ${delay}ms`);
        
        
        
        this.onStatusUpdate?.(t('service.whatsapp.reconnecting'));
        this.clearReconnectTimeout();
        this.reconnectTimeout = setTimeout(async () => {
            fileLog(`[scheduleReconnect] Executing reconnect attempt #${this.reconnectAttempts}`);
            this.isReconnecting = false;
            
            if (this.intentionalStop) {
                fileLog('[scheduleReconnect] Aborting - intentional stop detected');
                return;
            }
            
            try {
                await this.start(options);
            } catch (error) {
                fileLog(`[scheduleReconnect] Reconnect failed: ${error instanceof Error ? error.message : String(error)}`);
                if (!this.intentionalStop) {
                    this.scheduleReconnect(options);
                }
            }
        }, delay);
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

        const groupMetadataCache = this.groupMetadataCache;

        const socket = makeWASocket({
            version,
            printQRInTerminal: false,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger)
            },
            syncFullHistory: false,
            logger,
            cachedGroupMetadata: async (jid: string) => {
                return groupMetadataCache.get(jid) as any;
            }
        }) as WhatsAppSocketLike;

        return socket;
    }

    async start(options: WhatsAppStartOptions = {}) {
        fileLog(`[start] Starting WhatsApp service, isReconnecting=${this.isReconnecting}`);
        this.intentionalStop = false;
        if (this.isReconnecting) {
            fileLog('[start] Skipping - reconnect already in progress');
            return;
        }
        this.onStatusUpdate?.(t('service.whatsapp.connecting'));

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

        if (this.verboseMode) {
            fileLog(`[connection.update] connection=${connection}, hasDisconnect=${!!lastDisconnect}, qr=${!!qr}, isReconnecting=${this.isReconnecting}`);
        }

        if (qr) {
            await this.handlePairingQr(qr);
            return
        }

        if (connection === 'open') {
            await this.handleConnectionOpen();
            return
        }

        if (connection === 'connecting' ||
            update.receivedPendingNotifications ||
            update.isOnline ||
            update.isNewLogin) {
            return
        }

        if (connection === 'close') {
            await this.handleConnectionClosed(lastDisconnect, allowPairingOnAuthFailure, options);
            return;
        }

        if (this.verboseMode && connection !== undefined) {
            fileLog(`[connection.update] Ignoring unexpected connection state: ${connection}`);
        }
    }

    private async handlePairingQr(qr: string) {
        await this.sessionManager.setStatus('pairing');
        this.onQRCode?.(qr);
        this.onStatusUpdate?.(t('service.whatsapp.typeToConnect'));
        this.qrWasShown = true;
    }

    private async handleConnectionOpen() {
        fileLog('[handleConnectionOpen] Connection established successfully');
        
        
        if (this.verboseMode) {
            console.log(t('service.whatsapp.connectionOpened'));
        }

        this.isReconnecting = false;
        this.reconnectAttempts = 0;
        this.clearReconnectTimeout();
        await this.saveCreds?.();
        await this.sessionManager.markAuthStateAvailable();
        await this.sessionManager.setStatus('connected');
        this.onStatusUpdate?.(t('service.whatsapp.connected'));

        if (this.qrWasShown) {
            this.qrWasShown = false;
            console.log(t('service.whatsapp.qrConnected'));
            console.log(t('service.whatsapp.qrWelcomeMessage'));
            void this.sendQrWelcome();
        }
    }

    private async sendQrWelcome(): Promise<void> {
        const rawId = this.socket?.user?.id;
        if (!rawId) return;
        const selfJid = this.normalizeJidForComparison(rawId);
        await this.sessionManager.setOperatorJid(selfJid);
        try {
            await this.socket?.sendMessage(selfJid, { text: t('service.whatsapp.qrWelcomeMessage') });
        } catch {
            // Best-effort — welcome send failure must not abort the session.
        }
    }

    public getOperatorJid(): string {
        return this.sessionManager.getOperatorJid();
    }

    private isBadMacError(errorMessage: string): boolean {
        return errorMessage.includes('Bad MAC');
    }

    private isAuthRejected(statusCode: number | undefined, errorMessage: string): boolean {
        return errorMessage.includes('bad-request')
            || statusCode === 400
            || statusCode === 401
            || statusCode === DisconnectReason.loggedOut;
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

        fileLog(`[handleConnectionClosed] statusCode=${statusCode}, errorMessage="${errorMessage}", shouldReconnect=${shouldReconnect}, isBadMac=${isBadMac}, isAuthRejected=${isAuthRejected}, intentionalStop=${this.intentionalStop}, isReconnecting=${this.isReconnecting}`);


        if (this.intentionalStop) {
            if (this.verboseMode) {
                fileLog('[handleConnectionClosed] Skipping - intentional stop');
            }
            return;
        }

        if (this.verboseMode) {
            console.error(t('service.whatsapp.connectionClosed', { statusCode: statusCode ?? 'unknown', shouldReconnect: String(shouldReconnect) }));
        }

        if (isBadMac) {
            if (this.verboseMode) {
                console.error(t('service.whatsapp.badMacDetected'));
                console.error(t('service.whatsapp.runClearAuth'));
            }
            this.cleanupSocket();
            this.isReconnecting = false;
            this.reconnectAttempts = 0;
            this.onStatusUpdate?.(t('service.whatsapp.sessionErrorBadMac'));
            await this.sessionManager.setStatus('disconnected');
            this.onStatusUpdate?.(t('service.whatsapp.disconnected'));
            return;
        }

        if (isAuthRejected) {
            this.cleanupSocket();
            this.isReconnecting = false;
            this.reconnectAttempts = 0;

            if (allowPairingOnAuthFailure) {
                if (this.verboseMode) {
                    console.error(t('service.whatsapp.sessionRejected', { statusCode: statusCode ?? 'unknown' }));
                }
                this.onStatusUpdate?.(t('service.whatsapp.sessionRejected', { statusCode: statusCode ?? 'unknown' }));
                await this.sessionManager.deleteAuthState();
                await this.start({ ...options, allowPairingOnAuthFailure: false });
                return;
            }

            if (this.verboseMode) {
                console.error(t('service.whatsapp.sessionInvalidOrLoggedOut', { statusCode: statusCode ?? 'unknown' }));
            }
            this.onStatusUpdate?.(t('service.whatsapp.sessionInvalidOrLoggedOut', { statusCode: statusCode ?? 'unknown' }));
            await this.sessionManager.setStatus('logged-out');
            this.onStatusUpdate?.(t('service.whatsapp.disconnected'));
            return;
        }

        if (statusCode === DisconnectReason.connectionReplaced) {
            if (this.verboseMode) {
                console.error(t('service.whatsapp.connectionReplaced'));
            }
            this.cleanupSocket();
            this.isReconnecting = false;
            this.reconnectAttempts = 0;
            await this.sessionManager.setStatus('disconnected');
            this.onStatusUpdate?.(t('service.whatsapp.conflict'));
            return;
        }

        if (shouldReconnect) {
            if (this.isReconnecting) {
                fileLog('[handleConnectionClosed] Reconnect already in progress, skipping duplicate');
            } else {
                fileLog('[handleConnectionClosed] Initiating reconnect sequence');
                await this.saveCreds?.();
                this.cleanupSocket();
                this.scheduleReconnect(options);
            }
        } else {
            fileLog('[handleConnectionClosed] Not reconnecting - logged out or permanent disconnect');
            this.reconnectAttempts = 0;
            await this.sessionManager.setStatus('logged-out');
            this.onStatusUpdate?.(t('service.whatsapp.disconnected'));
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
        // Extract quote information and original message (for reactions) from the message
        const resolved = extractIncomingText(message.message, this.recentsService);
        const quotedMessage = 'quotedMessage' in resolved ? resolved.quotedMessage : undefined;

        // Don't record reactions in the recents store - they are events about existing messages
        if (resolved.kind === 'reaction') {
            return;
        }

        void Promise.resolve(this.onIncomingMessageRecorded?.({
            id: message.key.id ?? remoteJid,
            remoteJid,
            pushName: message.pushName || undefined,
            text,
            timestamp: this.getIncomingTimestamp(message.messageTimestamp),
            quotedMessage
        })).catch(error => {
            if (this.verboseMode) {
                console.error(t('service.whatsapp.failedRecordRecentMessage'), error);
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
        const isGroup = remoteJid.endsWith('@g.us');

        if (this.boundGroupJid) {
            // Group-only mode narrows the source before allow-list checks run.
            if (remoteJid !== this.boundGroupJid) return;
        }

        // Eagerly cache group metadata on incoming messages so it's
        // available for sender-key encryption when we reply
        if (isGroup) {
            void this.prepareGroupSession(remoteJid);
        }

        const senderJid = isGroup
            ? remoteJid
            : this.normalizeContactNumber(remoteJid.split('@')[0]);
        
        // Process the message with full context (including reaction lookup)
        const resolved = extractIncomingText(message.message, this.recentsService);
        const displayText = resolved.text;
        
        void this.recordIncomingMessage(message, remoteJid, displayText);

        const pushName = message.pushName || undefined;

        if (this.boundGroupJid) {
            if (!this.sessionManager.isAllowedGroup(this.boundGroupJid)) {
                await this.sessionManager.trackIgnoredNumber(this.boundGroupJid, pushName);
                return;
            }

            this.lastRemoteJid = remoteJid;
            this.onMessage?.(payload);
            return;
        }

        if (!this.sessionManager.isConversationAllowed(senderJid)) {
            if (this.isVerbose()) {
                console.log(t('service.whatsapp.ignoredNotAllowed', { senderJid }));
            }
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

    /**
     * Pre-loads group metadata into the cache for Baileys' cachedGroupMetadata.
     * This ensures Baileys can resolve group participants for Signal
     * sender-key encryption, preventing "No sessions" errors.
     */
    public async prepareGroupSession(jid: string): Promise<void> {
        if (!jid.endsWith('@g.us')) return;
        if (this.groupMetadataCache.has(jid)) {
            fileLog(`Group metadata cache HIT for ${jid}`);
            return;
        }
        const socket = this.getActiveSocket();
        if (!socket) return;
        try {
            fileLog(`Fetching group metadata for ${jid}...`);
            const metadata = await socket.groupMetadata(jid);
            this.groupMetadataCache.set(jid, metadata);
            fileLog(`Cached group metadata for ${jid} (${metadata.participants?.length ?? 0} participants)`);
        } catch (error) {
            fileLog(`FAILED to fetch group metadata for ${jid}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async sendMessage(jid: string, text: string) {
        const recipientJid = this.resolveOutboundRecipientJid(jid);

        // Ensure we show the typing indicator before sending
        await this.sendPresence(recipientJid, 'composing');

        const result = await this.messageSender.send({
            recipientJid,
            text: text
        });

        // After sending, we can stop the typing indicator
        await this.sendPresence(recipientJid, 'paused');

        if (!result.success) {
            console.error(t('service.whatsapp.failedSendMessage', { jid: recipientJid, error: result.error ?? t('message.sender.unknownError') }));
        }

        return result;
    }

    async sendMenuMessage(jid: string, text: string) {
        const normalizedJid = this.resolveOutboundRecipientJid(jid);
        const socket = this.getActiveSocket();

        if (!socket) {
            return {
                success: false,
                error: t('service.whatsapp.notConnected'),
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
            console.error(t('service.whatsapp.failedSendMenuMessage', { jid: normalizedJid }), error);
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
                console.error(t('service.whatsapp.failedPresenceUpdate', { jid }), error);
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
                console.error(t('service.whatsapp.failedMarkRead'), error);
            }
        }
    }

    async logout() {
        fileLog('[logout] Logging out - setting intentional stop');
        this.intentionalStop = true;
        await this.socket?.logout();
        await this.sessionManager.deleteAuthState();
    }

    async stop() {
        fileLog('[stop] Stopping WhatsApp service - setting intentional stop');
        this.intentionalStop = true;
        try {
            await this.saveCreds?.();
        } catch (error) {
            if (this.verboseMode) {
                console.error(t('service.whatsapp.failedPersistAuthState'), error);
            }
            fileLog(`[stop] Failed to save credentials: ${error instanceof Error ? error.message : String(error)}`);
        }

        this.cleanupSocket();
        this.isReconnecting = false;
        await this.sessionManager.setStatus('disconnected');
        this.onStatusUpdate?.(t('service.whatsapp.disconnected'));
    }
}
