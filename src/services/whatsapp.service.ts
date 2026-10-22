import {
    makeWASocket,
    extractMessageContent,
    generateMessageIDV2,
    DisconnectReason,
    makeCacheableSignalKeyStore,
    proto,
    toNumber,
    type WAMessage,
    type WAMessageKey,
    type MessageUpsertType,
    type AnyMessageContent,
    type BaileysEventMap,
    type MiscMessageGenerationOptions
} from 'baileys';
import P from 'pino';
import { SessionManager } from './session.manager.js';
import { IncomingMessage, SessionStatus, type IncomingMessageEnvelope, type IncomingProcessingState, type WhatsAppSessionContext, type MessageRequest, type MessageResult, type QuoteTarget, type TextSendOptions } from '../models/whatsapp.types.js';
import { MessageSender } from './message.sender.js';
import { installBaileysConsoleFilter } from './baileys-console-filter.js';
import { t } from '../i18n.js';
import { appendFileSync } from 'fs';
import { createStoragePaths } from './storage-path.js';
import { extractIncomingText } from './incoming-message.resolver.js';
import type { RecentsService } from './recents.service.js';
import { JidResolver } from './jid-resolver.service.js';
import { MessageStore } from './message-store.service.js';
import { HistorySyncService } from './history-sync.service.js';
import type { LifecycleUpdate } from '../models/message-archive.types.js';

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

type IncomingMessageContent = proto.IMessage;
type IncomingMessageLike = Pick<WAMessage, 'key' | 'message' | 'pushName' | 'messageTimestamp'>;

interface MessagesUpsertEvent {
    messages?: IncomingMessageLike[];
    type?: MessageUpsertType;
    requestId?: string;
}

interface GroupParticipantsUpdateEvent {
    id: string;
}

interface SentMessageLike {
    participant?: string | null;
    key?: WAMessageKey;
    message?: proto.IMessage | null;
}

interface WhatsAppSocketLike {
    user?: { id?: string; lid?: string };
    ev: {
        on(event: 'connection.update', handler: (update: ConnectionUpdateEvent) => void | Promise<void>): void;
        on(event: 'creds.update', handler: () => void | Promise<void>): void;
        on(event: 'messages.upsert', handler: (payload: MessagesUpsertEvent) => void | Promise<void>): void;
        on(event: 'group-participants.update', handler: (payload: GroupParticipantsUpdateEvent) => void | Promise<void>): void;
        on(event: 'lid-mapping.update', handler: (payload: { lid: string; pn: string }) => void): void;
        on(event: 'messages.delete', handler: (payload: { keys: WAMessageKey[] } | { jid: string; all: true }) => void): void;
        on(event: 'groups.update', handler: (payload: Array<{ id?: string }>) => void): void;
        on(event: 'messaging-history.set', handler: (payload: BaileysEventMap['messaging-history.set']) => void): void;
        on(event: 'messaging-history.status', handler: (payload: BaileysEventMap['messaging-history.status']) => void): void;
        on(event: 'messages.update', handler: (payload: BaileysEventMap['messages.update']) => void): void;
        on(event: 'messages.reaction', handler: (payload: BaileysEventMap['messages.reaction']) => void): void;
        on(event: 'message-receipt.update', handler: (payload: BaileysEventMap['message-receipt.update']) => void): void;
        removeAllListeners(event: 'messaging-history.set' | 'messaging-history.status' | 'messages.update' | 'messages.reaction' | 'message-receipt.update' | 'connection.update' | 'creds.update' | 'messages.upsert' | 'group-participants.update' | 'lid-mapping.update' | 'groups.update' | 'messages.delete'): void;
    };
    signalRepository?: { lidMapping: { getPNForLID(lid: string): Promise<string | null> } };
    fetchMessageHistory?(count: number, key: WAMessageKey, timestampMs: number): Promise<string>;
    end(reason?: unknown): void;
    logout(): Promise<void>;
    sendMessage(jid: string, content: AnyMessageContent, options?: MiscMessageGenerationOptions): Promise<SentMessageLike | undefined>;
    sendPresenceUpdate(presence: 'composing' | 'recording' | 'paused', jid: string): Promise<void>;
    readMessages(messages: WAMessageKey[]): Promise<void>;
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
    private startPromise?: Promise<void>;
    private restoreBaileysConsoleFilter?: () => void;
    private reconnectTimeout?: ReturnType<typeof setTimeout>;
    private intentionalStop = false;
    private onQRCode?: (qr: string) => void;
    private onMessage?: (message: IncomingMessageEnvelope) => void | Promise<void>;
    private incomingLedger = new Map<string, { key: WAMessageKey; scope: string; state: IncomingProcessingState; expiresAt: number }>();
    private readonly jidResolver = new JidResolver(() => {
        this.reindexIncomingLedger();
        this.messageStore?.reindex();
    });
    private readonly messageStore = new MessageStore(this.jidResolver, () => this.getAccountScope());
    private readonly historySync = new HistorySyncService(this.messageStore, {
        canonical: jid => this.canonicalConversation(jid), allowed: jid => this.historyAllowed(jid),
        connected: () => this.getEffectiveStatus() === 'connected',
        scope: () => JSON.stringify([this.getAccountScope(), this.sessionGeneration]),
        fetch: (count, key, timestamp) => {
            const socket = this.getActiveSocket();
            if (!socket?.fetchMessageHistory) return Promise.reject(new Error(t('history.unavailable')));
            return socket.fetchMessageHistory(count, key, timestamp);
        }
    });
    private identityAccount = '';
    private identityAuthDir = '';
    private sessionGeneration = 0;
    private onStatusUpdate?: (status: string) => void;
    private lastRemoteJid: string | null = null;
    private qrWasShown = false;
    private boundGroupJid: string | null = null;
    private fullHistorySync = false;
    private groupMetadataCache: Map<string, { id: string; subject: string; participants: Array<{ id: string }> }> = new Map();

    constructor(sessionManager: SessionManager) {
        this.sessionManager = sessionManager;
        this.messageSender = new MessageSender(this);
    }

    public setRecentsService(recentsService: RecentsService) {
        this.recentsService = recentsService;
        recentsService.useMessageStore?.(this.messageStore);
    }

    public async prepareArchive(): Promise<void> {
        const context = this.getSessionContext();
        await this.recentsService?.ensureInitialized();
        if (!this.isSessionContextCurrent(context)) return;
        if (this.identityAccount) await this.recentsService?.bindAccount?.(this.identityAccount, context.accountScope);
        if (this.messageStore.getArchiveState().degraded) this.onStatusUpdate?.(t('archive.degraded'));
    }

    public setFullHistorySync(enabled: boolean): void { this.fullHistorySync = enabled; }

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

    public registerOutgoing(jid: string, id: string, content?: AnyMessageContent): void {
        this.updateIdentityAccount();
        const key = { remoteJid: jid, id, fromMe: true };
        this.messageStore.own(key);
        if (!content) return;
        let message: proto.IMessage | undefined;
        const fields: { caption?: string; mimetype?: string; fileName?: string } = {};
        if ('caption' in content && typeof content.caption === 'string') fields.caption = content.caption;
        if ('mimetype' in content && typeof content.mimetype === 'string') fields.mimetype = content.mimetype;
        if ('fileName' in content && typeof content.fileName === 'string') fields.fileName = content.fileName;
        if ('text' in content && typeof content.text === 'string') message = { conversation: content.text };
        else if ('image' in content) message = { imageMessage: fields };
        else if ('document' in content) message = { documentMessage: fields };
        else if ('audio' in content) message = { audioMessage: fields };
        else if ('video' in content) message = { videoMessage: fields };
        if (message) this.messageStore.recordIntent({ key, message, messageTimestamp: Date.now() });
    }
    public async flushArchive(): Promise<void> { await this.messageStore.flush(); }

    public recordSendOutcome(jid: string, id: string, result: MessageResult): void {
        this.messageStore.recordOutcome({ remoteJid: jid, id, fromMe: true }, result);
    }

    public getSendOutcome(jid: string, id: string): MessageResult | undefined {
        return this.messageStore.getOutcome({ remoteJid: jid, id, fromMe: true });
    }

    public async sendContent(request: MessageRequest): Promise<MessageResult> {
        return this.messageSender.send(request);
    }

    public cacheSentMessage(id: string | null | undefined, message: proto.IMessage | null | undefined, key: WAMessageKey): void {
        if (!id || !message || !key.remoteJid) return;
        this.updateIdentityAccount();
        const completeKey = { ...key, id, fromMe: true };
        this.messageStore.own(completeKey);
        this.messageStore.put({ key: completeKey, message });
    }

    public findMessageKey(jid: string, id: string, hint: WAMessageKey = {}): WAMessageKey | undefined {
        return this.messageStore.find(jid, id, hint)?.key;
    }

    public getQuotedMessage(jid: string, quote: QuoteTarget): WAMessage | undefined {
        if (quote.scope && quote.scope !== this.messageStore.getArchiveState().scopeId) return undefined;
        const canonical = this.jidResolver.canonical(jid);
        if (!canonical || (quote.conversationJid && this.jidResolver.canonical(quote.conversationJid) !== canonical)) return undefined;
        const record = this.messageStore.find(jid, quote.messageId, { fromMe: quote.fromMe, participant: quote.participant });
        if (!record?.key.remoteJid || record.key.fromMe == null) return undefined;
        if (record.key.remoteJid.endsWith('@g.us') && !record.key.participant) return undefined;
        // Baileys rc14 rewrites own quoted authors to userJid (PN), losing an observed LID.
        if (record.key.fromMe && record.key.participant?.endsWith('@lid')) return undefined;
        const content = extractMessageContent(record.message);
        if (!content || !['conversation', 'extendedTextMessage', 'imageMessage', 'documentMessage', 'audioMessage', 'videoMessage'].some(kind => Boolean(content[kind as keyof typeof content]))) return undefined;
        return { key: { ...record.key }, message: record.message };
    }

    public invalidateMessage(key: WAMessageKey): void {
        if (key.id) this.messageStore.remove(key);
        else if (key.remoteJid) this.messageStore.clearChat(key.remoteJid);
    }

    public async requestHistory(jid: string, count = 50) {
        await this.prepareArchive();
        return { ...await this.historySync.request(jid, count), storage: this.recentsService?.getArchiveState?.() };
    }
    public async getHistoryStatus(id?: string) {
        await this.prepareArchive();
        return { success: !id || Boolean(this.historySync.status(id)), request: id ? this.historySync.status(id) : undefined,
            requests: id ? undefined : this.historySync.all(), globalSignal: this.historySync.globalSignal(),
            storage: this.recentsService?.getArchiveState?.() };
    }
    private historyAllowed(jid: string): boolean {
        const canonical = this.jidResolver.canonical(jid);
        if (!canonical || (this.boundGroupJid && canonical !== this.jidResolver.canonical(this.boundGroupJid))) return false;
        const number = this.jidResolver.senderNumber(jid);
        return Boolean(number && this.sessionManager.isConversationAllowed(number));
    }

    public async handleHistorySet(payload: BaileysEventMap['messaging-history.set']): Promise<void> {
        const context = this.getSessionContext();
        await this.prepareArchive();
        if (!this.isSessionContextCurrent(context)) return;
        for (const mapping of payload.lidPnMappings ?? []) this.jidResolver.bind(mapping.lid, mapping.pn);
        await this.handleIncomingMessages({ messages: payload.messages, type: 'append' });
        if (!this.isSessionContextCurrent(context)) return;
        const ids = payload.messages.filter(message => this.historyAllowed(message.key.remoteJid ?? '')
            && this.messageStore.find(message.key.remoteJid ?? '', message.key.id ?? '', message.key))
            .map(message => this.jidResolver.index(context.accountScope, message.key)).filter((id): id is string => Boolean(id));
        this.historySync.observeSet(payload, ids);
        await this.messageStore.flush();
    }

    public async handleLifecycle(updates: LifecycleUpdate[]): Promise<void> {
        const context = this.getSessionContext();
        await this.prepareArchive();
        if (!this.isSessionContextCurrent(context)) return;
        for (const update of updates) {
            await this.observeIncomingIdentity(update.key, context);
            if (!this.isSessionContextCurrent(context)) return;
            if (!update.key.remoteJid || !update.key.id) continue;
            const known = this.messageStore.find(update.key.remoteJid, update.key.id, { fromMe: update.key.fromMe });
            if (!this.historyAllowed(update.key.remoteJid) && !known) continue;
            const key = update.key.fromMe === true && known ? known.key : update.key;
            this.messageStore.reconcile({ ...update, key });
        }
        await this.messageStore.flush();
    }

    private reactionUpdate(key: WAMessageKey, reaction: proto.IReaction): LifecycleUpdate | undefined {
        const actorKey = reaction.key;
        const actor = actorKey?.fromMe ? this.identityAccount : actorKey?.participant ?? (!key.remoteJid?.endsWith('@g.us') ? actorKey?.remoteJid ?? key.remoteJid : undefined);
        if (!actor) return undefined;
        return { key, reaction: { participant: actor, text: reaction.text ?? '', timestamp: reaction.senderTimestampMs == null ? Date.now() : toNumber(reaction.senderTimestampMs) } };
    }

    private messageUpdates(payload: BaileysEventMap['messages.update']): LifecycleUpdate[] {
        return payload.map(({ key, update }) => {
            const result: LifecycleUpdate = { key };
            if (update.status != null) result.status = update.status;
            if (update.message === null || update.messageStubType === proto.WebMessageInfo.StubType.REVOKE) result.deleted = 'remote';
            else if (update.message) {
                const content = extractMessageContent(update.message.editedMessage?.message ?? update.message);
                const text = content?.conversation ?? content?.extendedTextMessage?.text ?? content?.imageMessage?.caption ?? content?.videoMessage?.caption ?? content?.documentMessage?.caption;
                if (typeof text === 'string') { result.text = text; result.editedAt = this.toMilliseconds(update.messageTimestamp); }
            }
            return result;
        });
    }

    public canonicalConversation(jid: string): string | undefined {
        return this.jidResolver.canonical(jid);
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

    private normalizeRecipientJid(jid: string): string {
        if (jid.includes('@')) return jid;
        const digits = jid.startsWith('+') ? jid.slice(1) : jid;
        return `${digits}@s.whatsapp.net`;
    }

    public resolveOutboundRecipientJid(recipient: string): string {
        if (SessionManager.isGroupJid(recipient)) {
            return recipient;
        }

        const senderNumber = this.jidResolver.senderNumber(recipient) ?? recipient;
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
        this.historySync.interrupt();
        this.clearReconnectTimeout();
        this.groupMetadataCache.clear();

        if (!this.socket) {
            return;
        }

        this.restoreBaileysConsoleFilter?.();
        this.restoreBaileysConsoleFilter = undefined;
        this.socket.ev.removeAllListeners('connection.update');
        this.socket.ev.removeAllListeners('creds.update');
        this.socket.ev.removeAllListeners('messages.upsert');
        this.socket.ev.removeAllListeners('group-participants.update');
        this.socket.ev.removeAllListeners('lid-mapping.update');
        this.socket.ev.removeAllListeners('groups.update');
        this.socket.ev.removeAllListeners('messages.delete');
        this.socket.ev.removeAllListeners('messaging-history.set');
        this.socket.ev.removeAllListeners('messaging-history.status');
        this.socket.ev.removeAllListeners('messages.update');
        this.socket.ev.removeAllListeners('messages.reaction');
        this.socket.ev.removeAllListeners('message-receipt.update');

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
            if (socket !== this.socket || this.intentionalStop) return;
            await saveCreds();
            if (socket === this.socket && !this.intentionalStop) await this.sessionManager.markAuthStateAvailable();
        });

        socket.ev.on('connection.update', async (update) => {
            if (socket !== this.socket || this.intentionalStop) return;
            await this.handleConnectionUpdate(update, options);
        });

        socket.ev.on('messages.upsert', (payload) => {
            if (socket !== this.socket || this.intentionalStop) return;
            void this.handleIncomingMessages(payload);
        });

        socket.ev.on('group-participants.update', ({ id }) => {
            if (socket === this.socket) this.groupMetadataCache.delete(id);
        });
        socket.ev.on('groups.update', updates => {
            if (socket !== this.socket) return;
            for (const update of updates) {
                if (update.id) this.groupMetadataCache.delete(update.id);
            }
        });
        socket.ev.on('messages.delete', payload => {
            if (socket !== this.socket || this.intentionalStop) return;
            void (async () => {
                const context = this.getSessionContext();
                await this.prepareArchive();
                if (!this.isSessionContextCurrent(context) || socket !== this.socket) return;
                if ('keys' in payload) await this.handleLifecycle(payload.keys.map(key => ({ key, deleted: 'local' as const })));
                else this.messageStore.clearChat(payload.jid);
                await this.messageStore.flush();
            })().catch(() => this.onStatusUpdate?.(t('archive.degraded')));
        });
        const run = (work: Promise<void>) => { void work.catch(() => this.onStatusUpdate?.(t('archive.degraded'))); };
        socket.ev.on('messaging-history.set', payload => {
            if (socket === this.socket && !this.intentionalStop) run(this.handleHistorySet(payload));
        });
        socket.ev.on('messaging-history.status', payload => {
            if (socket === this.socket && !this.intentionalStop) this.historySync.observeStatus(payload);
        });
        socket.ev.on('messages.update', payload => {
            if (socket === this.socket && !this.intentionalStop) run(this.handleLifecycle(this.messageUpdates(payload)));
        });
        socket.ev.on('messages.reaction', payload => {
            if (socket !== this.socket || this.intentionalStop) return;
            run(this.handleLifecycle(payload.map(({ key, reaction }) => this.reactionUpdate(key, reaction)).filter((entry): entry is LifecycleUpdate => Boolean(entry))));
        });
        socket.ev.on('message-receipt.update', payload => {
            if (socket !== this.socket || this.intentionalStop) return;
            run(this.handleLifecycle(payload.filter(entry => Boolean(entry.receipt.userJid)).map(({ key, receipt }) => ({ key,
                receipt: { participant: receipt.userJid!,
                    ...(receipt.receiptTimestamp != null ? { deliveredAt: toNumber(receipt.receiptTimestamp) * 1000 } : {}),
                    ...(receipt.readTimestamp != null ? { readAt: toNumber(receipt.readTimestamp) * 1000 } : {}),
                    ...(receipt.playedTimestamp != null ? { playedAt: toNumber(receipt.playedTimestamp) * 1000 } : {}) }
            }))));
        });
        socket.ev.on('lid-mapping.update', ({ lid, pn }) => {
            if (socket !== this.socket || this.intentionalStop) return;
            this.updateIdentityAccount();
            this.jidResolver.bind(lid, pn);
        });
    }

    private async createSocket(): Promise<WhatsAppSocketLike> {
        const { state, saveCreds } = await this.sessionManager.getAuthState();
        this.saveCreds = saveCreds;

        const logger = P({ level: this.verboseMode ? 'trace' : 'silent' });

        const groupMetadataCache = this.groupMetadataCache;

        const socket: WhatsAppSocketLike = makeWASocket({
            printQRInTerminal: false,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger)
            },
            syncFullHistory: this.fullHistorySync,
            logger,
            getMessage: async key => {
                if (socket !== this.socket || this.intentionalStop) return undefined;
                this.updateIdentityAccount();
                return this.messageStore.getForTransport(key)?.message;
            },
            cachedGroupMetadata: async (jid: string) => {
                return groupMetadataCache.get(jid) as any;
            }
        }) as WhatsAppSocketLike;

        return socket;
    }

    async start(options: WhatsAppStartOptions = {}) {
        if (this.startPromise) return this.startPromise;

        const startPromise = this.startSocket(options);
        this.startPromise = startPromise;
        try {
            await startPromise;
        } finally {
            if (this.startPromise === startPromise) {
                this.startPromise = undefined;
            }
        }
    }

    private async startSocket(options: WhatsAppStartOptions) {
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
        const socket = this.socket;
        const context = this.getSessionContext();
        fileLog('[handleConnectionOpen] Connection established successfully');
        
        
        if (this.verboseMode) {
            console.log(t('service.whatsapp.connectionOpened'));
        }

        this.isReconnecting = false;
        this.reconnectAttempts = 0;
        this.clearReconnectTimeout();
        await this.saveCreds?.();
        if (socket !== this.socket || !this.isSessionContextCurrent(context)) return;
        await this.sessionManager.markAuthStateAvailable();
        if (socket !== this.socket || !this.isSessionContextCurrent(context)) return;
        await this.prepareArchive();
        if (socket !== this.socket || !this.isSessionContextCurrent(context)) return;
        await this.sessionManager.setStatus('connected');
        if (socket !== this.socket || !this.isSessionContextCurrent(context)) return;
        this.onStatusUpdate?.(t('service.whatsapp.connected'));

        if (this.qrWasShown) {
            this.qrWasShown = false;
            console.log(t('service.whatsapp.qrConnected'));
            console.log(t('service.whatsapp.qrWelcomeMessage'));
            void this.sendQrWelcome();
        }
    }

    private async sendQrWelcome(): Promise<void> {
        const socket = this.socket;
        const rawId = socket?.user?.id;
        if (!socket || !rawId) return;
        const context = this.getSessionContext();
        const selfJid = this.normalizeJidForComparison(rawId);
        await this.sessionManager.setOperatorJid(selfJid);
        if (socket !== this.socket || !this.isSessionContextCurrent(context)) return;
        try {
            const id = generateMessageIDV2();
            this.registerOutgoing(selfJid, id);
            const response = await socket.sendMessage(selfJid, { text: t('service.whatsapp.qrWelcomeMessage') }, { messageId: id });
            if (this.isSessionContextCurrent(context)) {
                this.cacheSentMessage(response?.key?.id, response?.message, { ...response?.key, remoteJid: selfJid });
            }
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
                this.clearIdentityState();
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

    private toMilliseconds(timestamp: WAMessage['messageTimestamp']): number {
        if (timestamp == null) return Date.now();
        const value = toNumber(timestamp);
        return Number.isFinite(value) ? (value < 1_000_000_000_000 ? value * 1000 : value) : Date.now();
    }

    private getIncomingTimestamp(timestamp: WAMessage['messageTimestamp']): number {
        const value = timestamp == null ? NaN : toNumber(timestamp);
        return Number.isFinite(value) ? value : Date.now();
    }

    public getAccountScope(): string {
        return JSON.stringify([this.sessionManager.getAuthStateDir?.() ?? 'default', this.identityAccount || 'unpaired']);
    }

    public getSessionContext(): WhatsAppSessionContext {
        this.updateIdentityAccount();
        return { accountScope: this.getAccountScope(), generation: this.sessionGeneration };
    }

    public isSessionContextCurrent(context: WhatsAppSessionContext): boolean {
        this.updateIdentityAccount();
        return !this.intentionalStop && context.generation === this.sessionGeneration
            && context.accountScope === this.getAccountScope();
    }

    private updateIdentityAccount(): void {
        const account = this.socket?.user?.id;
        if (!account) return;
        const normalized = this.jidResolver.normalize(account);
        const authDir = this.sessionManager.getAuthStateDir?.() ?? 'default';
        if (this.identityAccount && (this.identityAccount !== normalized || this.identityAuthDir !== authDir)) {
            this.clearIdentityState();
        }
        this.identityAccount = normalized;
        this.identityAuthDir = authDir;
    }

    private clearIdentityState(): void {
        this.historySync.interrupt();
        this.sessionGeneration++;
        this.groupMetadataCache.clear();
        this.incomingLedger.clear();
        this.messageStore.pauseForAccountChange();
        this.jidResolver.clear();
        this.identityAccount = '';
        this.identityAuthDir = '';
        this.lastRemoteJid = null;
    }

    private reindexIncomingLedger(): void {
        const entries = [...this.incomingLedger.values()];
        this.incomingLedger.clear();
        for (const entry of entries) {
            const id = this.jidResolver.index(entry.scope, entry.key);
            if (!id) continue;
            const existing = this.incomingLedger.get(id);
            if (!existing) this.incomingLedger.set(id, entry);
            else existing.expiresAt = Math.max(existing.expiresAt, entry.expiresAt);
        }
    }

    private getIncomingKey(key: WAMessageKey): string | undefined {
        return this.jidResolver.index(this.getAccountScope(), key);
    }

    private async observeIncomingIdentity(key: WAMessageKey, context: WhatsAppSessionContext): Promise<void> {
        if (!this.isSessionContextCurrent(context)) return;
        this.jidResolver.observe(key);
        const jid = key.remoteJid;
        if (!jid || !jid.endsWith('@lid') || this.jidResolver.canonical(jid) !== this.jidResolver.normalize(jid)) return;
        const socket = this.socket;
        const phone = await socket?.signalRepository?.lidMapping.getPNForLID(jid);
        if (phone && socket === this.socket && this.isSessionContextCurrent(context)) this.jidResolver.bind(jid, phone);
    }

    private reserveIncoming(key: WAMessageKey): boolean {
        const now = Date.now();
        for (const [id, entry] of this.incomingLedger) {
            if (entry.expiresAt <= now) this.incomingLedger.delete(id);
        }
        const id = this.getIncomingKey(key);
        if (!id || this.incomingLedger.has(id) || this.messageStore.getProcessing(key)) return false;
        while (this.incomingLedger.size >= 5_000) {
            const oldest = this.incomingLedger.keys().next().value;
            if (oldest === undefined) break;
            this.incomingLedger.delete(oldest);
        }
        this.incomingLedger.set(id, { key: { ...key }, scope: this.getAccountScope(), state: 'reserved', expiresAt: now + 24 * 60 * 60 * 1000 });
        this.messageStore.recordProcessing(key, 'reserved');
        return true;
    }

    public markIncomingProcessing(key: WAMessageKey, state: IncomingProcessingState): void {
        const id = this.getIncomingKey(key);
        const entry = id ? this.incomingLedger.get(id) : undefined;
        if (entry) { entry.state = state; this.messageStore.recordProcessing(key, state); }
    }

    public getIncomingProcessingState(key: WAMessageKey): IncomingProcessingState | undefined {
        const id = this.getIncomingKey(key);
        const entry = id ? this.incomingLedger.get(id) : undefined;
        return entry && entry.expiresAt > Date.now() ? entry.state : this.messageStore.getProcessing(key);
    }

    private async recordIncomingMessage(message: IncomingMessageLike, remoteJid: string, text: string) {
        // Extract quote information and original message (for reactions) from the message
        const resolved = extractIncomingText(message.message, this.recentsService);
        const quotedMessage = 'quotedMessage' in resolved ? resolved.quotedMessage : undefined;

        // Don't record reactions in the recents store - they are events about existing messages
        if (resolved.kind === 'reaction' || resolved.kind === 'system') {
            return;
        }

        await Promise.resolve(this.onIncomingMessageRecorded?.({
            id: message.key.id ?? remoteJid,
            remoteJid,
            senderNumber: this.jidResolver.senderNumber(remoteJid) ?? remoteJid,
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
        if (this.intentionalStop || this.sessionManager.getStatus() !== 'connected') return;
        const context = this.getSessionContext();
        await this.prepareArchive();
        for (const message of payload.messages ?? []) {
            if (!this.isSessionContextCurrent(context) || this.sessionManager.getStatus() !== 'connected') break;
            try {
                await this.handleIncomingMessage(message, payload.type !== 'append' && !payload.requestId, context);
            } catch (error) {
                if (message?.key && this.isSessionContextCurrent(context)) this.markIncomingProcessing(message.key, 'failed');
                console.error(t('service.whatsapp.failedRecordRecentMessage'), error instanceof Error ? error.message : 'Message processing failed');
            }
        }
        if (this.isSessionContextCurrent(context) && payload.requestId) {
            const ids = (payload.messages ?? []).filter(message => this.historyAllowed(message.key.remoteJid ?? '')
                && this.messageStore.find(message.key.remoteJid ?? '', message.key.id ?? '', message.key))
                .map(message => this.jidResolver.index(context.accountScope, message.key)).filter((id): id is string => Boolean(id));
            this.historySync.observeResend(payload.requestId, ids);
        }
        await this.messageStore.flush();
    }

    private async handleIncomingMessage(message: IncomingMessageLike, live: boolean, context: WhatsAppSessionContext): Promise<void> {
        const { id, remoteJid } = message?.key ?? {};
        if (!id || !remoteJid || !message.message) return;
        if (this.boundGroupJid && remoteJid !== this.boundGroupJid) return;
        if (live && message.key.fromMe && this.isPiGeneratedMessage(this.extractText(message.message))) return;

        await this.observeIncomingIdentity(message.key, context);
        if (!this.isSessionContextCurrent(context)) return;
        const isGroup = remoteJid.endsWith('@g.us');
        const senderNumber = this.jidResolver.senderNumber(remoteJid);
        if (!senderNumber) return;
        const protocol = extractMessageContent(message.message)?.protocolMessage;

        const resolved = extractIncomingText(message.message, this.recentsService);
        if (!this.sessionManager.isConversationAllowed(senderNumber)) {
            if (!live) return;
            if (resolved.kind !== 'system' && resolved.kind !== 'reaction') this.recentsService?.recordIgnoredSummary?.({
                senderNumber, senderName: message.pushName ?? undefined, text: resolved.text, timestamp: this.toMilliseconds(message.messageTimestamp)
            });
            await this.recordIncomingMessage(message, remoteJid, resolved.text);
            if (this.isSessionContextCurrent(context)) await this.sessionManager.trackIgnoredNumber(senderNumber, message.pushName || undefined);
            return;
        }
        if (protocol?.type === proto.Message.ProtocolMessage.Type.REVOKE && protocol.key) {
            this.messageStore.reconcile({ key: { ...protocol.key, remoteJid }, deleted: 'remote' }); return;
        }
        if (protocol?.type === proto.Message.ProtocolMessage.Type.MESSAGE_EDIT && protocol.key && protocol.editedMessage) {
            const edited = extractIncomingText(protocol.editedMessage, this.recentsService);
            this.messageStore.reconcile({ key: { ...protocol.key, remoteJid }, text: edited.text,
                editedAt: protocol.timestampMs == null ? Date.now() : toNumber(protocol.timestampMs) }); return;
        }
        const reaction = extractMessageContent(message.message)?.reactionMessage;
        if (reaction?.key) {
            const update = this.reactionUpdate({ ...reaction.key, remoteJid }, { ...reaction, key: message.key });
            if (update) this.messageStore.reconcile(update); return;
        }
        if (live && this.messageStore.isOwn(message.key)) return;
        if (resolved.kind === 'system' || resolved.kind === 'reaction') return;
        if (!this.messageStore.accepts(message.key, this.toMilliseconds(message.messageTimestamp))) return;
        if (live && !this.reserveIncoming(message.key)) return;
        this.messageStore.put(message);
        await this.messageStore.flush();
        await this.recordIncomingMessage(message, remoteJid, resolved.text);
        if (!live || !this.isSessionContextCurrent(context)) return;
        if (isGroup) void this.prepareGroupSession(remoteJid);

        this.lastRemoteJid = remoteJid;
        await this.onMessage?.({ ...message, key: { ...message.key, id, remoteJid }, senderNumber, sessionContext: context });
        if (this.isSessionContextCurrent(context) && this.getIncomingProcessingState(message.key) === 'reserved') {
            this.markIncomingProcessing(message.key, 'prepared');
        }
    }

    setQRCodeCallback(callback: (qr: string) => void) {
        this.onQRCode = callback;
    }

    setMessageCallback(callback: (message: IncomingMessageEnvelope) => void | Promise<void>) {
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
        const context = this.getSessionContext();
        try {
            fileLog(`Fetching group metadata for ${jid}...`);
            const metadata = await socket.groupMetadata(jid);
            if (socket !== this.socket || !this.isSessionContextCurrent(context)) return;
            this.groupMetadataCache.set(jid, metadata);
            fileLog(`Cached group metadata for ${jid} (${metadata.participants?.length ?? 0} participants)`);
        } catch (error) {
            fileLog(`FAILED to fetch group metadata for ${jid}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async sendMessage(jid: string, text: string, preserveTransport = false, options?: TextSendOptions) {
        const sessionContext = this.getSessionContext();
        const quoted = options?.quote ? this.getQuotedMessage(jid, options.quote) : undefined;
        if (options?.quote && !quoted) return { success: false, error: t('quote.unavailable'), attempts: 0 };
        const recipientJid = quoted?.key.remoteJid ?? (preserveTransport ? jid : this.resolveOutboundRecipientJid(jid));

        // Ensure we show the typing indicator before sending
        await this.sendPresence(recipientJid, 'composing');

        const result = await this.messageSender.send({
            recipientJid,
            text: text,
            sessionContext,
            ...options
        });

        // After sending, we can stop the typing indicator
        if (this.isSessionContextCurrent(sessionContext)) await this.sendPresence(recipientJid, 'paused');

        if (!result.success) {
            console.error(t('service.whatsapp.failedSendMessage', { jid: recipientJid, error: result.error ?? t('message.sender.unknownError') }));
        }

        return result;
    }

    async sendMenuMessage(jid: string, text: string, quote?: QuoteTarget) {
        const sessionContext = this.getSessionContext();
        const quoted = quote ? this.getQuotedMessage(jid, quote) : undefined;
        if (quote && !quoted) return { success: false, error: t('quote.unavailable'), attempts: 0 };
        const normalizedJid = quoted?.key.remoteJid ?? this.resolveOutboundRecipientJid(jid);
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
            return await this.messageSender.send({
                recipientJid: normalizedJid,
                text,
                options: { brand: false, maxRetries: 1 },
                quote,
                sessionContext
            });
        } catch (error: unknown) {
            if (this.isSessionContextCurrent(sessionContext)) await this.sendPresence(normalizedJid, 'paused');
            console.error(t('service.whatsapp.failedSendMenuMessage', { jid: normalizedJid }), error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                attempts: 1
            };
        } finally {
            if (this.isSessionContextCurrent(sessionContext)) await this.sendPresence(normalizedJid, 'paused');
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

    async markRead(key: WAMessageKey) {
        const socket = this.getActiveSocket();
        if (!socket || !key.remoteJid || !key.id || key.fromMe == null) return;
        if (key.remoteJid.endsWith('@g.us') && !key.participant) return;
        try {
            await socket.readMessages([{ ...key }]);
        } catch (error) {
            if (this.verboseMode) {
                console.error(t('service.whatsapp.failedMarkRead'), error);
            }
        }
    }

    async logout() {
        this.historySync.interrupt();
        fileLog('[logout] Logging out - setting intentional stop');
        this.intentionalStop = true;
        this.sessionGeneration++;
        await this.socket?.logout();
        this.cleanupSocket();
        this.isReconnecting = false;
        this.clearIdentityState();
        await this.messageStore.close();
        await this.sessionManager.deleteAuthState();
    }

    async stop() {
        this.historySync.interrupt();
        fileLog('[stop] Stopping WhatsApp service - setting intentional stop');
        this.intentionalStop = true;
        this.sessionGeneration++;
        try {
            await this.saveCreds?.();
        } catch (error) {
            if (this.verboseMode) {
                console.error(t('service.whatsapp.failedPersistAuthState'), error);
            }
            fileLog(`[stop] Failed to save credentials: ${error instanceof Error ? error.message : String(error)}`);
        }

        this.cleanupSocket();
        await this.messageStore.close();
        this.messageStore.clear();
        this.isReconnecting = false;
        await this.sessionManager.setStatus('disconnected');
        this.onStatusUpdate?.(t('service.whatsapp.disconnected'));
    }
}
