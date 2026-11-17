import { extractMessageContent, toNumber, type WAMessage, type WAMessageKey, type proto } from 'baileys';
import type { IncomingProcessingState, MessageResult } from '../models/whatsapp.types.js';
import { emptyArchive, type ArchiveOptions, type ArchivedMessage, type LifecycleUpdate, type HistoryRequestRecord } from '../models/message-archive.types.js';
import { JidResolver } from './jid-resolver.service.js';
import { ArchiveFiles } from './message-store.persistence.js';

type MessageInput = Pick<WAMessage, 'key' | 'message' | 'messageTimestamp' | 'pushName'>;
interface StoredMessage { scope: string; key: WAMessageKey; message: proto.IMessage; expiresAt: number; timestamp: number }
interface OwnedMessage { scope: string; key: WAMessageKey; expiresAt: number; outcome?: MessageResult }
const DAY = 86_400_000;

/** One authority for retained records, with a separately bounded raw retry cache. */
export class MessageStore {
    private messages = new Map<string, StoredMessage>();
    private owned = new Map<string, OwnedMessage>();
    private data = emptyArchive();
    private files?: ArchiveFiles;
    private options?: ArchiveOptions;
    private activeScope?: string;
    private degraded?: string;
    private writes: Promise<void> = Promise.resolve();
    private writeScheduled = false;
    private switching: Promise<void> = Promise.resolve();
    private initializing?: Promise<void>;
    private restoring = false;
    private paused = false;
    private committed = emptyArchive();

    constructor(private readonly resolver: JidResolver, private readonly scope: () => string,
        private readonly limit = 500, private readonly ttlMs = DAY) {}

    public initialize(options: ArchiveOptions): Promise<void> {
        if (this.initializing && this.options?.root === options.root && this.options.authProfile === options.authProfile) return this.initializing;
        const previous = this.initializing;
        this.initializing = (async () => {
            if (previous) { await previous; await this.close(); }
            this.options = options;
            this.files = new ArchiveFiles(options);
            this.data = emptyArchive(); this.committed = emptyArchive(); this.degraded = undefined; this.paused = false;
            try {
                await this.files!.initialize();
                if (this.files!.lastAccount) await this.activate(this.files!.lastAccount!, this.scope());
            } catch { this.failStorage(); }
        })();
        return this.initializing;
    }

    public activate(account: string, scope: string): Promise<void> {
        const work = this.switching.then(async () => {
            if (!this.files || this.degraded) return;
            if (this.files.account === account && this.files.hasWriter) {
                this.activeScope = scope;
                if (this.paused) { this.paused = false; this.restoring = true; this.resolver.replaceState(this.data); this.restoring = false; }
                return;
            }
            await this.flush();
            this.clear();
            this.data = emptyArchive();
            this.activeScope = scope;
            try {
                this.data = await this.files.select(account);
                this.committed = structuredClone(this.data);
                this.paused = false;
                this.restoring = true;
                this.resolver.replaceState(this.data);
                this.restoring = false;
                for (const entry of this.data.processing) {
                    if (!['consumed', 'failed', 'interrupted'].includes(entry.state)) entry.state = 'interrupted';
                }
                for (const request of this.data.requests) if (['pending', 'partial'].includes(request.status)) request.status = 'interrupted';
                this.pruneArchive();
                this.save();
                await this.flush();
            } catch {
                this.restoring = false; this.failStorage();
                try { if (this.files.scopeId) this.data = await this.files.readScope(this.files.scopeId); } catch { /* Preserve empty/degraded view when committed data is unreadable. */ }
            }
        });
        this.switching = work;
        return work;
    }

    public getArchiveState() {
        return { enabled: Boolean(this.files), degraded: this.degraded, account: this.files?.account, path: this.files?.path, scopeId: this.files?.scopeId,
            incomplete: this.data.incomplete, writable: Boolean(this.files?.hasWriter && !this.degraded) };
    }
    public async flush(): Promise<void> {
        for (;;) { const pending = this.writes; await pending; if (pending === this.writes) return; }
    }
    public async close(): Promise<void> { await this.switching; await this.flush(); await this.files?.release(); }
    public async listHistoryScopes() { return this.files?.scopes() ?? []; }
    public async historyRecords(scope?: string): Promise<ArchivedMessage[]> {
        if (!scope) {
            if (!this.files?.account && this.files) return this.historyRecords('legacy-unassigned');
            return this.listRecords();
        }
        if (!this.files) return [];
        const snapshot = await this.files.readScope(scope);
        // Historical read views do not change the active ingestion account or writer.
        const resolver = new JidResolver(); resolver.restoreState(snapshot);
        return structuredClone(snapshot.records.filter(record => record.expiresAt > Date.now())
            .map(record => ({ ...record, canonicalChat: resolver.canonical(record.key.remoteJid ?? '') })));
    }
    public listRecords(): ArchivedMessage[] {
        if (this.paused) return [];
        if (this.activeScope && this.activeScope !== this.scope()) return [];
        this.pruneArchive();
        return structuredClone(this.data.records.filter(record => this.resolver.canonical(record.key.remoteJid ?? ''))
            .map(record => ({ ...record, canonicalChat: this.resolver.canonical(record.key.remoteJid ?? '') })));
    }

    public accepts(key: WAMessageKey, timestamp = Date.now()): boolean {
        const chat = this.resolver.canonical(key.remoteJid ?? '');
        if (!chat) return false;
        if (timestamp <= Math.max(this.data.accountFloor, this.data.floors[chat] ?? 0,
            this.options ? Date.now() - (this.options.maxAgeMs ?? 30 * DAY) : 0)) return false;
        return !this.data.tombstones.some(tombstone => this.matches(key, tombstone.key));
    }

    public put(input: MessageInput, retainRaw = true): void {
        if (this.paused) return;
        this.prune();
        const index = this.resolver.index(this.scope(), input.key);
        const timestamp = this.timestamp(input.messageTimestamp);
        if (!index || !input.message || this.isViewOnce(input.message) || input.key.isViewOnce || !this.accepts(input.key, timestamp)) return;
        const expiresAt = this.expiry(input, Date.now() + this.ttlMs);
        if (expiresAt <= Date.now()) {
            if (this.files?.account) this.reconcile({ key: input.key, deleted: 'local' });
            return;
        }
        if (retainRaw) {
            this.messages.delete(index);
            this.messages.set(index, { scope: this.scope(), key: this.safeKey(input.key), message: input.message, expiresAt, timestamp });
            this.trim(this.messages);
        }
        if (!this.files?.account || this.activeScope !== this.scope() || this.degraded) return;
        let existing = this.findRecord(input.key);
        if (!existing && input.key.fromMe && input.key.participant) {
            const intents = this.data.records.filter(record => !record.key.participant && record.sendState === 'unknown'
                && this.matches(record.key, { remoteJid: input.key.remoteJid, id: input.key.id, fromMe: true }));
            if (intents.length === 1) { existing = intents[0]; existing.key = this.safeKey(input.key); }
        }
        const quote = this.safeQuote(input.message);
        if (!quote) return;
        const text = this.quoteText(quote);
        const context = this.context(input.message);
        const record: ArchivedMessage = existing ?? { key: this.safeKey(input.key), timestamp, direction: input.key.fromMe ? 'outgoing' : 'incoming',
            text, incomplete: this.data.incomplete || undefined, expiresAt: this.expiry(input, timestamp + (this.options?.maxAgeMs ?? 30 * DAY)) };
        if (existing?.editedAt === undefined && !existing?.deleted) { record.text = text; record.quote = quote; }
        if (!record.deleted) {
            const normalized = extractMessageContent(input.message);
            for (const kind of ['image', 'document', 'audio', 'video'] as const) {
                const media = normalized?.[`${kind}Message`];
                if (!media) continue;
                const value = media as { fileName?: string | null; mimetype?: string | null; ptt?: boolean | null; seconds?: number | null; fileLength?: proto.Message.IImageMessage['fileLength'] };
                record.media = { kind, ...(typeof value.fileName === 'string' ? { fileName: value.fileName } : {}),
                    ...(typeof value.mimetype === 'string' ? { mimetype: value.mimetype } : {}),
                    ...(typeof value.ptt === 'boolean' ? { voiceNote: value.ptt } : {}),
                    ...(typeof value.seconds === 'number' && Number.isFinite(value.seconds) ? { seconds: value.seconds } : {}),
                    ...(value.fileLength != null && Number.isFinite(toNumber(value.fileLength)) ? { size: toNumber(value.fileLength) } : {}) };
            }
        }
        if (input.pushName) record.senderName = input.pushName;
        if (context?.stanzaId) record.quotedMessageId = context.stanzaId;
        record.expiresAt = Math.min(record.expiresAt, this.expiry(input, timestamp + (this.options?.maxAgeMs ?? 30 * DAY)));
        if (!existing) this.data.records.push(record);
        const pending = this.data.pending.filter(entry => this.matches(record.key, entry.update.key));
        this.data.pending = this.data.pending.filter(entry => !pending.includes(entry));
        for (const { update } of pending) this.apply(record, update);
        if (record.editedAt !== undefined) this.evictRaw(record.key);
        this.pruneArchive();
        this.save();
    }

    public recordIntent(input: MessageInput): void {
        this.put(input, false);
        const record = this.findRecord(input.key);
        if (record) { record.sendState = 'unknown'; delete record.quote; this.save(); }
    }

    public annotate(key: WAMessageKey, details: { senderName?: string; quotedMessageId?: string }): void {
        const record = this.findRecord(key);
        if (record) { if (details.senderName) record.senderName = details.senderName;
            if (details.quotedMessageId) record.quotedMessageId = details.quotedMessageId; this.save(); }
    }

    public get(key: WAMessageKey): StoredMessage | undefined {
        return key.remoteJid && key.id ? this.find(key.remoteJid, key.id, key) : undefined;
    }
    /** Retry receipts name requesters; persisted quote projections must NEVER serve retries. */
    public getForTransport(key: WAMessageKey): StoredMessage | undefined {
        return key.remoteJid && key.id ? this.findRaw(key.remoteJid, key.id, key.fromMe ? { fromMe: true } : key) : undefined;
    }
    public find(jid: string, id: string, hint: WAMessageKey = {}): StoredMessage | undefined {
        const raw = this.findRaw(jid, id, hint);
        if (raw) return raw;
        if (this.paused || this.degraded || (this.activeScope && this.activeScope !== this.scope())) return undefined;
        this.pruneArchive();
        const records = this.data.records.filter(record => !record.deleted && record.quote && this.matches(record.key, { ...hint, remoteJid: jid, id }));
        if (records.length !== 1) return undefined;
        const record = records[0];
        return { scope: this.scope(), key: this.safeKey(record.key), message: structuredClone(record.quote!), expiresAt: record.expiresAt, timestamp: record.timestamp };
    }
    private findRaw(jid: string, id: string, hint: WAMessageKey): StoredMessage | undefined {
        this.prune();
        const matches = [...this.messages.values()].filter(record => record.scope === this.scope() && this.matches(record.key, { ...hint, remoteJid: jid, id }));
        return matches.length === 1 ? { ...matches[0], key: this.safeKey(matches[0].key) } : undefined;
    }
    public remove(key: WAMessageKey): void { this.reconcile({ key, deleted: 'local' }); }
    public clearChat(jid: string): void {
        const chat = this.resolver.canonical(jid);
        if (!chat) return;
        this.raiseFloor(chat, Date.now()); this.evictRaw({ remoteJid: jid }); this.pruneArchive(); this.save();
    }

    public reconcile(update: LifecycleUpdate): void {
        update = { ...update, key: this.safeKey(update.key) };
        const chat = this.resolver.canonical(update.key.remoteJid ?? '');
        if (!chat || !update.key.id) return;
        const matches = this.data.records.filter(record => this.matches(record.key, update.key));
        if (update.deleted) {
            const time = matches.length ? Math.max(...matches.map(record => record.timestamp)) : Date.now();
            this.data.tombstones.push({ key: this.safeKey(update.key), timestamp: time, observedAt: Date.now(), kind: update.deleted });
            for (const record of matches) this.apply(record, update);
            this.evictRaw(update.key);
        } else if (matches.length === 1) {
            this.apply(matches[0], update);
            if (update.text !== undefined) this.evictRaw(update.key);
        } else if (!matches.length) {
            // Preserve the complete received key. Never guess a different chat/participant.
            this.data.pending.push({ update: structuredClone(update), receivedAt: Date.now() });
        }
        this.pruneArchive(); this.save();
    }

    private apply(record: ArchivedMessage, update: LifecycleUpdate): void {
        if (update.deleted) { record.deleted = update.deleted; record.text = ''; delete record.quote; delete record.media; delete record.reactions; return; }
        if (record.deleted) return;
        if (update.status !== undefined && Number.isFinite(update.status) && (!record.key.remoteJid?.endsWith('@g.us') || update.status <= 2)) record.status = Math.max(record.status ?? 0, update.status);
        if (update.text !== undefined && (update.editedAt ?? 0) >= (record.editedAt ?? 0)) {
            record.text = update.text; record.editedAt = update.editedAt ?? Date.now();
            if (record.quote?.conversation !== undefined) record.quote = { conversation: update.text };
            else if (record.quote) {
                for (const [kind, value] of Object.entries(record.quote)) if (value && typeof value === 'object') {
                    record.quote = { [kind]: { ...value, [kind === 'extendedTextMessage' ? 'text' : 'caption']: update.text } };
                    break;
                }
            }
        }
        if (update.receipt) {
            const participant = this.resolver.canonical(update.receipt.participant);
            if (participant) {
                const receipt = (record.receipts ??= {})[participant] ?? {};
                for (const field of ['deliveredAt', 'readAt', 'playedAt'] as const) {
                    const time = update.receipt[field];
                    if (time !== undefined && Number.isFinite(time)) receipt[field] = Math.max(receipt[field] ?? 0, time);
                }
                record.receipts[participant] = receipt;
            }
        }
        if (update.reaction) {
            const participant = this.resolver.canonical(update.reaction.participant);
            if (participant) {
                const previous = record.reactions?.[participant];
                if (!previous || previous.timestamp < update.reaction.timestamp
                    || (previous.timestamp === update.reaction.timestamp && previous.text.localeCompare(update.reaction.text) < 0)) {
                    (record.reactions ??= {})[participant] = { text: update.reaction.text, timestamp: update.reaction.timestamp };
                }
            }
        }
    }

    public own(key: WAMessageKey): void {
        this.prune(); const index = this.ownedIndex(this.scope(), key); if (!index) return;
        this.owned.set(index, { ...this.owned.get(index), scope: this.scope(), key: this.safeKey(key), expiresAt: Date.now() + this.ttlMs }); this.trim(this.owned);
    }
    public recordOutcome(key: WAMessageKey, outcome: MessageResult): void {
        this.prune(); const index = this.ownedIndex(this.scope(), key); const owned = index ? this.owned.get(index) : undefined;
        if (owned) owned.outcome = { ...outcome };
        const record = this.findRecord(key);
        if (record) { record.sendState = outcome.success ? 'accepted' : outcome.delivery === 'unknown' ? 'unknown' : 'failed'; this.save(); }
    }
    public getOutcome(key: WAMessageKey): MessageResult | undefined {
        this.prune(); const index = this.ownedIndex(this.scope(), key); const value = index ? this.owned.get(index)?.outcome : undefined;
        return value ? { ...value } : undefined;
    }
    public isOwn(key: WAMessageKey): boolean {
        this.prune();
        if (key.fromMe !== true) return false;
        const index = this.ownedIndex(this.scope(), key);
        if (index && this.owned.has(index)) return true;
        return Boolean(this.findRecord({ remoteJid: key.remoteJid, id: key.id, fromMe: true })?.sendState);
    }
    public recordProcessing(key: WAMessageKey, state: IncomingProcessingState): void {
        if (!this.files?.account || this.activeScope !== this.scope()) return;
        let entry = this.data.processing.find(entry => this.matches(entry.key, key));
        if (!entry) { entry = { key: this.safeKey(key), state, expiresAt: Date.now() + DAY }; this.data.processing.push(entry); }
        entry.state = state; this.pruneArchive(); this.save();
    }
    public getProcessing(key: WAMessageKey): IncomingProcessingState | undefined {
        if (this.paused || (this.activeScope && this.activeScope !== this.scope())) return undefined;
        return this.data.processing.find(entry => entry.expiresAt > Date.now() && this.matches(entry.key, key))?.state;
    }
    public requests(): HistoryRequestRecord[] { if (this.paused) return []; this.pruneArchive(); return structuredClone(this.data.requests); }
    public removeRequest(id: string): void { this.data.requests = this.data.requests.filter(entry => entry.id !== id); this.save(); }
    public saveRequest(request: HistoryRequestRecord): void {
        this.data.requests = this.data.requests.filter(entry => entry.id !== request.id);
        this.data.requests.push(structuredClone(request)); this.pruneArchive(); this.save();
    }
    public oldestAnchor(jid: string): ArchivedMessage | undefined {
        return this.listRecords().filter(record => !record.deleted && record.quote && record.key.fromMe != null && (!jid.endsWith('@g.us') || record.key.participant)
            && this.resolver.canonical(record.key.remoteJid ?? '') === this.resolver.canonical(jid))
            .sort((a, b) => a.timestamp - b.timestamp || (a.key.id ?? '').localeCompare(b.key.id ?? ''))[0];
    }

    public reindex(): void {
        if (this.paused) return;
        const messages = [...this.messages.values()]; const owned = [...this.owned.values()]; this.messages.clear(); this.owned.clear();
        for (const record of messages) { const index = this.resolver.index(record.scope, record.key); if (index && !this.messages.has(index)) this.messages.set(index, record); }
        for (const record of owned) { const index = this.ownedIndex(record.scope, record.key); if (index) this.owned.set(index, record); }
        const merged = new Map<string, ArchivedMessage>();
        for (const record of this.data.records) {
            const index = this.resolver.index('archive', record.key);
            if (!index) continue;
            const previous = merged.get(index);
            if (!previous) merged.set(index, record);
            else {
                if ((record.editedAt ?? 0) > (previous.editedAt ?? 0)) this.apply(previous, { key: previous.key, text: record.text, editedAt: record.editedAt });
                if (record.status !== undefined) this.apply(previous, { key: previous.key, status: record.status });
                for (const [participant, receipt] of Object.entries(record.receipts ?? {})) this.apply(previous, { key: previous.key, receipt: { participant, ...receipt } });
                for (const [participant, reaction] of Object.entries(record.reactions ?? {})) this.apply(previous, { key: previous.key, reaction: { participant, ...reaction } });
                if (record.deleted) this.apply(previous, { key: previous.key, deleted: record.deleted });
                previous.expiresAt = Math.min(previous.expiresAt, record.expiresAt);
            }
        }
        this.data.records = [...merged.values()];
        this.data.pending = this.data.pending.filter(entry => {
            const records = this.data.records.filter(record => this.matches(record.key, entry.update.key));
            if (records.length !== 1) return true;
            this.apply(records[0], entry.update);
            if (entry.update.text !== undefined || entry.update.deleted) this.evictRaw(entry.update.key);
            return false;
        });
        for (const [chat, floor] of Object.entries(this.data.floors)) { const canonical = this.resolver.canonical(chat); if (canonical) this.raiseFloor(canonical, floor); }
        if (!this.restoring) { this.pruneArchive(); this.save(); }
    }
    public clear(): void { this.messages.clear(); this.owned.clear(); }
    public pauseForAccountChange(): void { this.clear(); this.paused = Boolean(this.files); }

    private findRecord(key: WAMessageKey): ArchivedMessage | undefined {
        if (this.activeScope && this.activeScope !== this.scope()) return undefined;
        const records = this.data.records.filter(record => this.matches(record.key, key)); return records.length === 1 ? records[0] : undefined;
    }
    private matches(key: WAMessageKey, hint: WAMessageKey): boolean {
        const chat = this.resolver.canonical(key.remoteJid ?? '');
        return Boolean(chat && chat === this.resolver.canonical(hint.remoteJid ?? '') && (!hint.id || key.id === hint.id)
            && (hint.fromMe == null || key.fromMe === hint.fromMe)
            && (!hint.participant || this.resolver.canonical(key.participant ?? '') === this.resolver.canonical(hint.participant)));
    }
    private evictRaw(key: WAMessageKey): void {
        for (const [index, record] of this.messages) if (record.scope === this.scope() && this.matches(record.key, key)) this.messages.delete(index);
    }
    private ownedIndex(scope: string, key: WAMessageKey): string | undefined {
        const chat = this.resolver.canonical(key.remoteJid ?? ''); return chat && key.id ? JSON.stringify([scope, chat, key.id]) : undefined;
    }
    private prune(): void {
        const now = Date.now();
        for (const [index, record] of this.messages) if (record.expiresAt <= now || !this.accepts(record.key, record.timestamp)) this.messages.delete(index);
        for (const [index, record] of this.owned) if (record.expiresAt <= now) this.owned.delete(index);
    }
    private trim<T>(collection: Map<string, T>): void {
        while (collection.size > this.limit) { const oldest = collection.keys().next().value; if (oldest === undefined) break; collection.delete(oldest); }
    }
    private raiseFloor(chat: string, timestamp: number): void { this.data.floors[chat] = Math.max(this.data.floors[chat] ?? 0, timestamp); }
    private pruneArchive(): void {
        if (!this.options) return;
        const now = Date.now();
        this.data.processing = this.data.processing.filter(entry => entry.expiresAt > now).slice(-5_000);
        this.data.requests = this.data.requests.filter(entry => entry.createdAt > now - DAY).slice(-100);
        const pending = this.data.pending.filter(entry => entry.receivedAt > now - DAY);
        if (pending.length !== this.data.pending.length || pending.length > (this.options.maxPending ?? 500)) {
            this.data.incomplete = true;
            for (const record of this.data.records) record.incomplete = true;
        }
        this.data.pending = pending.slice(-(this.options.maxPending ?? 500));
        const expired = this.data.records.filter(record => record.expiresAt <= now);
        for (const record of expired) this.data.tombstones.push({ key: this.safeKey(record.key), timestamp: record.timestamp, observedAt: now, kind: 'local' });
        this.data.records = this.data.records.filter(record => record.expiresAt > now);
        while (this.data.tombstones.length > (this.options.maxTombstones ?? 5_000)
            || (this.data.tombstones[0]?.observedAt ?? now) < now - ((this.options.maxAgeMs ?? 30 * DAY) + DAY)) {
            const tombstone = this.data.tombstones.shift()!;
            const chat = this.resolver.canonical(tombstone.key.remoteJid ?? '');
            if (chat) this.raiseFloor(chat, tombstone.timestamp);
        }
        const counts = new Map<string, number>();
        this.data.records.sort((a, b) => b.timestamp - a.timestamp || (b.key.id ?? '').localeCompare(a.key.id ?? ''));
        this.data.records = this.data.records.filter(record => {
            const chat = this.resolver.canonical(record.key.remoteJid ?? ''); if (!chat) return false;
            const count = (counts.get(chat) ?? 0) + 1; counts.set(chat, count);
            if (count > (this.options!.maxRecords ?? 1_000)) { this.raiseFloor(chat, record.timestamp); return false; }
            return record.timestamp > Math.max(this.data.accountFloor, this.data.floors[chat] ?? 0, now - (this.options!.maxAgeMs ?? 30 * DAY));
        });
        const max = this.options.maxBytes ?? 100 * 1024 * 1024;
        while (Buffer.byteLength(JSON.stringify(this.data)) > max && this.data.records.length) {
            const record = this.data.records.pop()!; const chat = this.resolver.canonical(record.key.remoteJid ?? ''); if (chat) this.raiseFloor(chat, record.timestamp);
        }
        if (Buffer.byteLength(JSON.stringify(this.data)) > max) {
            this.data.accountFloor = Math.max(this.data.accountFloor, ...Object.values(this.data.floors), ...this.data.tombstones.map(t => t.timestamp));
            this.data.floors = {}; this.data.tombstones = []; this.data.pending = []; this.data.processing = []; this.data.requests = []; this.data.incomplete = true;
        }
        this.data.records = this.data.records.filter(record => this.accepts(record.key, record.timestamp) || Boolean(record.deleted));
        for (const [index, record] of this.messages) {
            const persistent = this.data.records.find(entry => this.matches(entry.key, record.key));
            if (record.scope === this.scope() && (!this.accepts(record.key, record.timestamp) || persistent?.deleted)) this.messages.delete(index);
        }
    }
    private save(): void {
        if (!this.files?.path || !this.files.hasWriter || this.degraded || this.restoring) return;
        Object.assign(this.data, this.resolver.exportState());
        this.pruneArchive();
        if (this.writeScheduled) return;
        this.writeScheduled = true;
        const files = this.files; const path = files.path;
        this.writes = this.writes.then(async () => {
            this.writeScheduled = false;
            if (!this.degraded && path) {
                const snapshot = structuredClone(this.data);
                await files.write(path, snapshot); this.committed = snapshot;
            }
        }).catch(() => { this.data = structuredClone(this.committed); this.failStorage(); });
    }
    private failStorage(): void { this.degraded = 'Archive unavailable: another writer, invalid schema, or filesystem failure. Originals were not reset; explicit recovery is required.'; }
    private safeKey(key: WAMessageKey): WAMessageKey {
        const result: WAMessageKey = {};
        for (const field of ['remoteJid', 'id', 'participant', 'remoteJidAlt', 'participantAlt', 'remoteJidUsername', 'participantUsername', 'server_id', 'addressingMode'] as const) if (typeof key[field] === 'string') result[field] = key[field];
        if (typeof key.fromMe === 'boolean') result.fromMe = key.fromMe;
        return result;
    }
    private safeQuote(message: proto.IMessage): proto.IMessage | undefined {
        const content = extractMessageContent(message);
        if (!content) return undefined;
        if (typeof content.conversation === 'string') return { conversation: content.conversation };
        for (const kind of ['extendedTextMessage', 'imageMessage', 'documentMessage', 'audioMessage', 'videoMessage'] as const) {
            const value = content[kind]; if (!value) continue;
            const fields: Record<string, string> = {};
            for (const field of ['text', 'caption', 'fileName', 'mimetype']) {
                const text = (value as Record<string, unknown>)[field]; if (typeof text === 'string') fields[field] = text;
            }
            return { [kind]: fields };
        }
        return undefined;
    }
    private quoteText(quote: proto.IMessage): string {
        if (typeof quote.conversation === 'string') return quote.conversation;
        for (const value of Object.values(quote)) if (value && typeof value === 'object') {
            const fields = value as { text?: string; caption?: string; fileName?: string };
            return fields.text ?? fields.caption ?? fields.fileName ?? '';
        }
        return '';
    }
    private timestamp(value: WAMessage['messageTimestamp']): number {
        if (value == null) return Date.now(); const number = toNumber(value);
        return Number.isFinite(number) && number >= 0 ? (number < 1_000_000_000_000 ? number * 1000 : number) : Date.now();
    }
    private isViewOnce(message: proto.IMessage): boolean {
        if (message.viewOnceMessage || message.viewOnceMessageV2 || message.viewOnceMessageV2Extension) return true;
        if (message.imageMessage?.viewOnce || message.videoMessage?.viewOnce || message.audioMessage?.viewOnce) return true;
        return message.ephemeralMessage?.message ? this.isViewOnce(message.ephemeralMessage.message) : false;
    }
    private context(message: proto.IMessage): proto.IContextInfo | undefined {
        for (const value of Object.values(extractMessageContent(message) ?? {})) if (value && typeof value === 'object' && 'contextInfo' in value) return (value as { contextInfo?: proto.IContextInfo }).contextInfo ?? undefined;
        return undefined;
    }
    private expiry(input: MessageInput, limit: number): number {
        const expiration = input.message ? this.context(input.message)?.expiration : undefined;
        return expiration && input.messageTimestamp != null ? Math.min(limit, this.timestamp(input.messageTimestamp) + expiration * 1000) : limit;
    }
}
