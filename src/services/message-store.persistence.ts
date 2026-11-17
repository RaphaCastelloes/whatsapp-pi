import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm, readdir, chmod, stat } from 'node:fs/promises';
import { join, basename } from 'node:path';
import type { FileHandle } from 'node:fs/promises';
import { emptyArchive, type ArchiveOptions, type ArchiveSnapshot, type HistoryScope, type ArchivedMessage } from '../models/message-archive.types.js';

interface ProfileMarker { version: 1; id: string; profile: string; accounts: string[]; lastAccount?: string }
const digest = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 32);

/** Disk/lock handling only. MessageStore remains the sole mutation authority. */
export class ArchiveFiles {
    private marker?: ProfileMarker;
    private markerPath: string;
    private lock?: { path: string; file: FileHandle };
    public account?: string;
    public path?: string;

    constructor(public readonly options: ArchiveOptions) {
        this.markerPath = join(options.root, `profile-${digest(options.authProfile)}.json`);
    }

    async initialize(): Promise<void> {
        await mkdir(this.options.root, { recursive: true, mode: 0o700 });
        await chmod(this.options.root, 0o700);
        try {
            this.marker = this.validateMarker(await this.readJson(this.markerPath));
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            this.marker = { version: 1, id: randomUUID(), profile: this.options.authProfile, accounts: [] };
            try {
                const file = await open(this.markerPath, 'wx', 0o600);
                try { await file.writeFile(JSON.stringify(this.marker)); await file.sync(); } finally { await file.close(); }
            } catch (creation) {
                if ((creation as NodeJS.ErrnoException).code !== 'EEXIST') throw creation;
                this.marker = this.validateMarker(await this.readJson(this.markerPath));
            }
        }
        if (this.marker.profile !== this.options.authProfile) throw new Error('Archive profile mismatch');
        await this.importLegacy();
    }

    get lastAccount(): string | undefined { return this.marker?.lastAccount; }
    get hasWriter(): boolean { return Boolean(this.lock); }
    get scopeId(): string | undefined { return this.marker && this.account ? `${this.marker.id}.${digest(this.account)}` : undefined; }

    async select(account: string): Promise<ArchiveSnapshot> {
        if (!this.marker || !account || account.length > 256) throw new Error('Invalid archive account');
        await this.release();
        this.account = account;
        this.path = this.partitionPath(this.marker.id, account);
        const lockPath = this.path + '.lock';
        try {
            this.lock = { path: lockPath, file: await open(lockPath, 'wx', 0o600) };
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
            const owner = JSON.parse(await readFile(lockPath, 'utf8')) as { pid?: number };
            if (!Number.isSafeInteger(owner.pid) || owner.pid! <= 0) throw new Error('Archive locked; explicit operator recovery required');
            try { process.kill(owner.pid!, 0); }
            catch (probe) {
                if ((probe as NodeJS.ErrnoException).code !== 'ESRCH') throw new Error('Archive locked');
                await rm(lockPath);
                this.lock = { path: lockPath, file: await open(lockPath, 'wx', 0o600) };
            }
            if (!this.lock) throw new Error('Archive already has a writer');
        }
        await this.lock.file.writeFile(JSON.stringify({ pid: process.pid }));
        let snapshot: ArchiveSnapshot;
        try { snapshot = this.validateSnapshot(await this.readJson(this.path)); }
        catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            snapshot = emptyArchive();
            await this.atomic(this.path, snapshot);
        }
        this.marker.accounts = [...new Set([...this.marker.accounts, account])];
        this.marker.lastAccount = account;
        await this.atomic(this.markerPath, this.marker);
        return snapshot;
    }

    async write(path: string, snapshot: ArchiveSnapshot): Promise<void> {
        if (!this.lock || path !== this.path) throw new Error('Archive writer is not active');
        await this.atomic(path, snapshot);
    }

    async release(): Promise<void> {
        const lock = this.lock;
        this.lock = undefined;
        if (lock) { await lock.file.close(); await rm(lock.path, { force: true }); }
    }

    async scopes(): Promise<HistoryScope[]> {
        const scopes: HistoryScope[] = [{ id: 'legacy-unassigned', profile: 'legacy-unassigned', readOnly: true }];
        for (const file of await readdir(this.options.root)) {
            if (!/^profile-[a-f0-9]{32}\.json$/.test(file)) continue;
            const marker = this.validateMarker(await this.readJson(join(this.options.root, file)));
            for (const account of marker.accounts) scopes.push({ id: `${marker.id}.${digest(account)}`, profile: marker.profile, account, readOnly: true });
        }
        return scopes;
    }

    async readScope(id: string): Promise<ArchiveSnapshot> {
        if (id === 'legacy-unassigned') {
            try { return this.validateSnapshot(await this.readJson(join(this.options.root, 'legacy-unassigned.json'))); }
            catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyArchive(); throw error; }
        }
        if (!(await this.scopes()).some(scope => scope.id === id)) throw new Error('Unknown local history scope');
        return this.validateSnapshot(await this.readJson(join(this.options.root, `account-${id}.json`)));
    }

    private partitionPath(profile: string, account: string): string { return join(this.options.root, `account-${profile}.${digest(account)}.json`); }

    private async readJson(path: string): Promise<unknown> {
        if ((await stat(path)).size > (this.options.maxBytes ?? 100 * 1024 * 1024)) throw new Error('Archive exceeds byte budget');
        return JSON.parse(await readFile(path, 'utf8')) as unknown;
    }

    private validateMarker(input: unknown): ProfileMarker {
        const marker = input as ProfileMarker;
        if (marker?.version !== 1 || typeof marker.id !== 'string' || !/^[a-f0-9-]{36}$/.test(marker.id)
            || typeof marker.profile !== 'string' || !Array.isArray(marker.accounts)
            || marker.accounts.some(account => typeof account !== 'string' || !account || account.length > 256)
            || (marker.lastAccount !== undefined && !marker.accounts.includes(marker.lastAccount))) throw new Error('Invalid/future archive profile');
        return marker;
    }

    public validateSnapshot(input: unknown): ArchiveSnapshot {
        const data = input as ArchiveSnapshot;
        if (data?.version !== 1 || !Array.isArray(data.records) || !Array.isArray(data.processing)
            || !Array.isArray(data.tombstones) || !Array.isArray(data.pending) || !Array.isArray(data.requests)
            || !Array.isArray(data.aliases) || !Array.isArray(data.conflicts) || !data.floors || typeof data.floors !== 'object'
            || !Number.isFinite(data.accountFloor) || typeof data.incomplete !== 'boolean') throw new Error('Invalid/future archive; original preserved');
        const fields = (value: unknown, allowed: string[]) => {
            if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) throw new Error('Unexpected archive fields; original preserved');
        };
        const time = (value: unknown) => { if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('Invalid archive timestamp'); };
        const key = (value: unknown) => {
            fields(value, ['remoteJid', 'id', 'fromMe', 'participant', 'remoteJidAlt', 'participantAlt', 'remoteJidUsername', 'participantUsername', 'server_id', 'addressingMode']);
            const entry = value as Record<string, unknown>;
            if (typeof entry.remoteJid !== 'string' || typeof entry.id !== 'string') throw new Error('Incomplete archive key');
            for (const [field, item] of Object.entries(entry)) {
                if (field === 'fromMe' ? typeof item !== 'boolean' : typeof item !== 'string' || item.length > 512) throw new Error('Invalid archive key');
            }
        };
        fields(data, ['version', 'records', 'processing', 'tombstones', 'pending', 'floors', 'accountFloor', 'requests', 'aliases', 'conflicts', 'incomplete']);
        for (const record of data.records) {
            fields(record, ['key', 'canonicalChat', 'text', 'timestamp', 'direction', 'senderName', 'quotedMessageId', 'quote', 'media', 'expiresAt', 'status', 'sendState', 'editedAt', 'deleted', 'receipts', 'reactions', 'incomplete', 'legacySender']);
            key(record.key); time(record.timestamp); time(record.expiresAt);
            if (typeof record.text !== 'string' || !['incoming', 'outgoing'].includes(record.direction)) throw new Error('Invalid archived record');
            for (const field of ['canonicalChat', 'senderName', 'quotedMessageId', 'legacySender'] as const) if (record[field] !== undefined && typeof record[field] !== 'string') throw new Error('Invalid archive label');
            if (record.incomplete !== undefined && typeof record.incomplete !== 'boolean') throw new Error('Invalid completeness flag');
            if (record.status !== undefined) { time(record.status); if (!Number.isInteger(record.status) || record.status > 5) throw new Error('Invalid receipt status'); }
            if (record.editedAt !== undefined) time(record.editedAt);
            if (record.sendState !== undefined && !['accepted', 'unknown', 'failed'].includes(record.sendState)) throw new Error('Invalid archive send state');
            if (record.deleted !== undefined && !['remote', 'local'].includes(record.deleted)) throw new Error('Invalid archive deletion');
            if (record.media) {
                fields(record.media, ['kind', 'fileName', 'mimetype', 'voiceNote', 'seconds', 'size']);
                if (!['image', 'document', 'audio', 'video'].includes(record.media.kind)) throw new Error('Invalid media metadata');
                for (const field of ['fileName', 'mimetype'] as const) if (record.media[field] !== undefined && typeof record.media[field] !== 'string') throw new Error('Invalid media label');
                if (record.media.voiceNote !== undefined && typeof record.media.voiceNote !== 'boolean') throw new Error('Invalid voice-note metadata');
                if (record.media.seconds !== undefined) time(record.media.seconds);
                if (record.media.size !== undefined) time(record.media.size);
            }
            if (record.quote) {
                fields(record.quote, ['conversation', 'extendedTextMessage', 'imageMessage', 'documentMessage', 'audioMessage', 'videoMessage']);
                if (Object.keys(record.quote).length !== 1) throw new Error('Ambiguous archive quote');
                for (const [kind, value] of Object.entries(record.quote)) {
                    if (kind === 'conversation') { if (typeof value !== 'string') throw new Error('Invalid quote text'); }
                    else {
                        fields(value, ['text', 'caption', 'fileName', 'mimetype']);
                        if (Object.values(value).some(item => typeof item !== 'string')) throw new Error('Invalid quote projection');
                    }
                }
            }
            for (const [participant, receipt] of Object.entries(record.receipts ?? {})) {
                if (!participant.includes('@')) throw new Error('Invalid receipt participant'); fields(receipt, ['deliveredAt', 'readAt', 'playedAt']); Object.values(receipt).forEach(time);
            }
            for (const [participant, reaction] of Object.entries(record.reactions ?? {})) {
                if (!participant.includes('@')) throw new Error('Invalid reaction participant'); fields(reaction, ['text', 'timestamp']); time(reaction.timestamp);
                if (typeof reaction.text !== 'string') throw new Error('Invalid reaction');
            }
        }
        for (const entry of data.processing) { fields(entry, ['key', 'state', 'expiresAt']); key(entry.key); time(entry.expiresAt); if (!['reserved', 'prepared', 'handed-off', 'consumed', 'failed', 'interrupted'].includes(entry.state)) throw new Error('Invalid processing state'); }
        for (const entry of data.tombstones) { fields(entry, ['key', 'timestamp', 'observedAt', 'kind']); key(entry.key); time(entry.timestamp); time(entry.observedAt); if (!['local', 'remote'].includes(entry.kind)) throw new Error('Invalid tombstone'); }
        for (const [chat, floor] of Object.entries(data.floors)) { if (!chat.includes('@')) throw new Error('Invalid admission chat'); time(floor); }
        for (const alias of data.aliases) { fields(alias, ['lid', 'pn']); if (typeof alias.lid !== 'string' || !/^\d+@lid$/.test(alias.lid) || typeof alias.pn !== 'string' || !/^\d+@s\.whatsapp\.net$/.test(alias.pn)) throw new Error('Invalid alias'); }
        if (data.conflicts.some(jid => typeof jid !== 'string' || !jid.includes('@'))) throw new Error('Invalid alias conflict');
        for (const entry of data.pending) {
            fields(entry, ['update', 'receivedAt']); time(entry.receivedAt); key(entry.update.key);
            fields(entry.update, ['key', 'status', 'text', 'editedAt', 'deleted', 'receipt', 'reaction']);
            if (entry.update.status !== undefined) time(entry.update.status);
            if (entry.update.editedAt !== undefined) time(entry.update.editedAt);
            if (entry.update.text !== undefined && typeof entry.update.text !== 'string') throw new Error('Invalid pending text');
            if (entry.update.deleted !== undefined && !['remote', 'local'].includes(entry.update.deleted)) throw new Error('Invalid pending deletion');
            if (entry.update.receipt) { fields(entry.update.receipt, ['participant', 'deliveredAt', 'readAt', 'playedAt']); if (typeof entry.update.receipt.participant !== 'string' || !entry.update.receipt.participant.includes('@')) throw new Error('Invalid pending receipt'); for (const field of ['deliveredAt', 'readAt', 'playedAt'] as const) if (entry.update.receipt[field] !== undefined) time(entry.update.receipt[field]); }
            if (entry.update.reaction) { fields(entry.update.reaction, ['participant', 'text', 'timestamp']); time(entry.update.reaction.timestamp); if (typeof entry.update.reaction.text !== 'string' || typeof entry.update.reaction.participant !== 'string' || !entry.update.reaction.participant.includes('@')) throw new Error('Invalid pending reaction'); }
        }
        for (const entry of data.requests) { fields(entry, ['id', 'chat', 'anchor', 'createdAt', 'status', 'count', 'imported', 'progress', 'syncType', 'chunkOrder', 'explicit']); key(entry.anchor); time(entry.createdAt); if (typeof entry.id !== 'string' || typeof entry.chat !== 'string' || !['pending', 'partial', 'complete', 'unknown', 'interrupted', 'failed'].includes(entry.status) || !Number.isInteger(entry.count) || entry.count < 1 || entry.count > 100 || !Number.isFinite(entry.imported)) throw new Error('Invalid history request'); }
        for (const entry of data.requests) {
            for (const field of ['progress', 'syncType', 'chunkOrder'] as const) if (entry[field] !== undefined) time(entry[field]);
            if (entry.progress !== undefined && entry.progress > 100) throw new Error('Invalid history progress');
            if (entry.syncType !== undefined && !Number.isInteger(entry.syncType)) throw new Error('Invalid sync type');
            if (entry.chunkOrder !== undefined && !Number.isInteger(entry.chunkOrder)) throw new Error('Invalid chunk order');
            if (entry.explicit !== undefined && typeof entry.explicit !== 'boolean') throw new Error('Invalid completion flag');
            if (!Number.isSafeInteger(entry.imported) || entry.imported < 0 || entry.imported > entry.count) throw new Error('Invalid imported count');
        }
        return data;
    }

    private async importLegacy(): Promise<void> {
        const destination = join(this.options.root, 'legacy-unassigned.json');
        try { this.validateSnapshot(await this.readJson(destination)); return; }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
        let content: string;
        try {
            if ((await stat(this.options.legacyPath)).size > (this.options.maxBytes ?? 100 * 1024 * 1024)) throw new Error('Legacy recents exceeds archive budget');
            content = await readFile(this.options.legacyPath, 'utf8');
        } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
        const legacy = JSON.parse(content) as { messagesBySender?: Record<string, unknown[]>; conversations?: Array<{ senderNumber: string; senderName?: string }> };
        if (!legacy || typeof legacy !== 'object' || !legacy.messagesBySender || typeof legacy.messagesBySender !== 'object') throw new Error('Invalid legacy recents; original preserved');
        const records: ArchivedMessage[] = [];
        for (const [sender, messages] of Object.entries(legacy.messagesBySender)) {
            if (!Array.isArray(messages)) continue;
            for (const value of messages) {
                const message = value as { messageId?: string; text?: string; timestamp?: number; direction?: string };
                if (typeof message?.messageId !== 'string' || typeof message.text !== 'string' || !Number.isFinite(message.timestamp)
                    || !['incoming', 'outgoing'].includes(message.direction ?? '')) continue;
                records.push({ key: { remoteJid: sender, id: message.messageId }, legacySender: sender, text: message.text,
                    timestamp: message.timestamp!, direction: message.direction as 'incoming' | 'outgoing',
                    senderName: legacy.conversations?.find(c => c.senderNumber === sender)?.senderName,
                    expiresAt: Number.MAX_SAFE_INTEGER, incomplete: true });
            }
        }
        const backup = this.options.legacyPath + '.pre-archive-backup';
        try {
            const file = await open(backup, 'wx', 0o600);
            try { await file.writeFile(content); await file.sync(); } finally { await file.close(); }
        } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
        await this.atomic(destination, { ...emptyArchive(), records });
    }

    private async atomic(path: string, data: unknown): Promise<void> {
        const temporary = join(this.options.root, `${basename(path)}.${randomUUID()}.tmp`);
        const file = await open(temporary, 'wx', 0o600);
        try {
            try { await file.chmod(0o600); await file.writeFile(JSON.stringify(data)); await file.sync(); } finally { await file.close(); }
            await rename(temporary, path);
        } catch (error) { await rm(temporary, { force: true }); throw error; }
    }
}
