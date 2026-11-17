import { extractMessageContent, toNumber, type WAMessage, type WAMessageKey, type proto } from 'baileys';
import { JidResolver } from './jid-resolver.service.js';

type MessageInput = Pick<WAMessage, 'key' | 'message' | 'messageTimestamp'>;
interface StoredMessage {
    scope: string;
    key: WAMessageKey;
    message: proto.IMessage;
    expiresAt: number;
}
interface OwnedMessage {
    scope: string;
    key: WAMessageKey;
    expiresAt: number;
}

/** Memory-only protocol data. Persistent, sanitized records belong to Phase 3. */
export class MessageStore {
    private messages = new Map<string, StoredMessage>();
    private owned = new Map<string, OwnedMessage>();

    constructor(
        private readonly resolver: JidResolver,
        private readonly scope: () => string,
        private readonly limit = 500,
        private readonly ttlMs = 24 * 60 * 60 * 1000
    ) {}

    public put(input: MessageInput): void {
        this.prune();
        const index = this.resolver.index(this.scope(), input.key);
        if (!index || !input.message || this.isViewOnce(input.message) || input.key.isViewOnce) return;
        const expiresAt = this.expiry(input);
        if (expiresAt <= Date.now()) return;
        this.messages.delete(index);
        this.messages.set(index, { scope: this.scope(), key: { ...input.key }, message: input.message, expiresAt });
        this.trim(this.messages);
    }

    public get(key: WAMessageKey): StoredMessage | undefined {
        if (!key.remoteJid || !key.id) return undefined;
        return this.find(key.remoteJid, key.id, key);
    }

    /** Outgoing retry receipts name the requester, not the original message author. */
    public getForTransport(key: WAMessageKey): StoredMessage | undefined {
        if (key.fromMe === true && key.remoteJid && key.id) {
            return this.find(key.remoteJid, key.id, { fromMe: true });
        }
        return this.get(key);
    }

    public find(jid: string, id: string, hint: WAMessageKey = {}): StoredMessage | undefined {
        this.prune();
        const chat = this.resolver.canonical(jid);
        if (!chat) return undefined;
        const matches = [...this.messages.values()].filter(record => {
            if (record.scope !== this.scope() || record.key.id !== id) return false;
            if (this.resolver.canonical(record.key.remoteJid ?? '') !== chat) return false;
            if (hint.fromMe != null && Boolean(record.key.fromMe) !== hint.fromMe) return false;
            if (hint.participant && this.resolver.canonical(record.key.participant ?? '') !== this.resolver.canonical(hint.participant)) return false;
            return true;
        });
        if (matches.length !== 1) return undefined;
        const match = matches[0];
        return { ...match, key: { ...match.key } };
    }

    public own(key: WAMessageKey): void {
        this.prune();
        const index = this.ownedIndex(this.scope(), key);
        if (!index) return;
        this.owned.set(index, { scope: this.scope(), key: { ...key }, expiresAt: Date.now() + this.ttlMs });
        this.trim(this.owned);
    }

    public isOwn(key: WAMessageKey): boolean {
        this.prune();
        const index = this.ownedIndex(this.scope(), key);
        return key.fromMe === true && Boolean(index && this.owned.has(index));
    }

    public reindex(): void {
        const records = [...this.messages.values()];
        const owned = [...this.owned.values()];
        this.messages.clear();
        this.owned.clear();
        for (const record of records) {
            const index = this.resolver.index(record.scope, record.key);
            if (!index) continue;
            const existing = this.messages.get(index);
            if (!existing) this.messages.set(index, record);
            else existing.expiresAt = Math.min(existing.expiresAt, record.expiresAt);
        }
        for (const record of owned) {
            const index = this.ownedIndex(record.scope, record.key);
            if (index) this.owned.set(index, record);
        }
        this.prune();
    }

    public clear(): void {
        this.messages.clear();
        this.owned.clear();
    }

    private ownedIndex(scope: string, key: WAMessageKey): string | undefined {
        const chat = key.remoteJid ? this.resolver.canonical(key.remoteJid) : undefined;
        return chat && key.id ? JSON.stringify([scope, chat, key.id]) : undefined;
    }

    private prune(): void {
        const now = Date.now();
        for (const [id, record] of this.messages) if (record.expiresAt <= now) this.messages.delete(id);
        for (const [id, record] of this.owned) if (record.expiresAt <= now) this.owned.delete(id);
    }

    private trim<T>(collection: Map<string, T>): void {
        while (collection.size > this.limit) {
            const oldest = collection.keys().next().value;
            if (oldest === undefined) break;
            collection.delete(oldest);
        }
    }

    private isViewOnce(message: proto.IMessage): boolean {
        if (message.viewOnceMessage || message.viewOnceMessageV2 || message.viewOnceMessageV2Extension) return true;
        return message.ephemeralMessage?.message ? this.isViewOnce(message.ephemeralMessage.message) : false;
    }

    private expiry(input: MessageInput): number {
        let expiresAt = Date.now() + this.ttlMs;
        const content = extractMessageContent(input.message);
        for (const value of Object.values(content ?? {})) {
            if (!value || typeof value !== 'object' || !('contextInfo' in value)) continue;
            const context = (value as { contextInfo?: proto.IContextInfo }).contextInfo;
            const expiration = context?.expiration;
            if (expiration && input.messageTimestamp != null) {
                expiresAt = Math.min(expiresAt, (toNumber(input.messageTimestamp) + expiration) * 1000);
            }
        }
        return expiresAt;
    }
}
