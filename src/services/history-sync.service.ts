import { randomUUID } from 'node:crypto';
import { proto, type BaileysEventMap, type WAMessageKey } from 'baileys';
import { MessageStore } from './message-store.service.js';
import { t } from '../i18n.js';
import type { HistoryRequestRecord } from '../models/message-archive.types.js';

interface HistoryAccess {
    canonical(jid: string): string | undefined;
    allowed(jid: string): boolean;
    connected(): boolean;
    scope(): string;
    fetch(count: number, key: WAMessageKey, timestampMs: number): Promise<string>;
}
type SetSignal = Pick<BaileysEventMap['messaging-history.set'], 'peerDataRequestSessionId' | 'progress' | 'syncType' | 'chunkOrder' | 'isLatest'>;
interface ActiveRequest { id: string; scope: string; createdAt: number; cancel(reason: 'timeout' | 'interrupted'): void }
interface Observation { signal: SetSignal; ids: Set<string>; at: number }

/** Explicit network requests only. Import and local read projections never start a fetch. */
export class HistorySyncService {
    private readonly active = new Map<string, ActiveRequest>();
    private readonly observations = new Map<string, Observation>();
    private lastStatus?: BaileysEventMap['messaging-history.status'];
    constructor(private readonly store: MessageStore, private readonly access: HistoryAccess) {}

    async request(jid: string, count = 50): Promise<{ success: boolean; request?: HistoryRequestRecord; error?: string }> {
        this.expire();
        if (!Number.isInteger(count) || count < 1 || count > 100) return { success: false, error: t('history.invalidCount') };
        const chat = this.access.canonical(jid);
        if (!chat || !this.access.allowed(chat)) return { success: false, error: t('history.denied') };
        if (!this.access.connected()) return { success: false, error: t('history.offline') };
        if (!this.store.getArchiveState().writable) return { success: false, error: t('history.unavailable') };
        if (this.active.has(chat) || this.active.size >= 100) return { success: false, error: t('history.active') };
        const anchor = this.store.oldestAnchor(chat);
        if (!anchor) return { success: false, error: t('history.anchorMissing') };
        const record: HistoryRequestRecord = { id: `local:${randomUUID()}`, chat, anchor: { ...anchor.key }, createdAt: Date.now(), status: 'pending', count, imported: 0 };
        const scope = this.access.scope();
        let cancel!: (reason: 'timeout' | 'interrupted') => void;
        const cancelled = new Promise<{ kind: 'timeout' | 'interrupted' }>(resolve => { cancel = reason => resolve({ kind: reason }); });
        const active: ActiveRequest = { id: record.id, scope, createdAt: record.createdAt, cancel };
        this.active.set(chat, active);
        this.store.saveRequest(record);
        const timer = setTimeout(() => cancel('timeout'), 60_000);
        try {
            const response = await Promise.race([
                Promise.resolve().then(() => this.access.fetch(count, anchor.key, anchor.timestamp)).then(id => ({ kind: 'id' as const, id }), () => ({ kind: 'failed' as const })), cancelled
            ]);
            if (scope !== this.access.scope() || this.active.get(chat) !== active || !this.access.connected()) return { success: false, error: t('history.offline') };
            if (response.kind !== 'id' || !response.id || response.id.length > 512) {
                record.status = response.kind === 'timeout' ? 'unknown' : response.kind === 'interrupted' ? 'interrupted' : 'failed';
                this.store.saveRequest(record); this.active.delete(chat);
                return { success: false, request: record, error: t('history.failed') };
            }
            this.store.removeRequest(record.id);
            record.id = response.id;
            active.id = response.id;
            this.store.saveRequest(record);
            this.applyObservation(record.id);
            await this.store.flush();
            if (scope !== this.access.scope()) return { success: false, error: t('history.offline') };
            return { success: true, request: this.status(record.id) };
        } finally { clearTimeout(timer); }
    }

    status(id: string): HistoryRequestRecord | undefined { this.expire(); return this.store.requests().find(request => request.id === id); }
    all(): HistoryRequestRecord[] { this.expire(); return this.store.requests(); }
    globalSignal(): BaileysEventMap['messaging-history.status'] | undefined { return this.lastStatus ? { ...this.lastStatus } : undefined; }

    observeSet(signal: SetSignal, admittedIds: string[]): void {
        this.expire();
        const id = signal.peerDataRequestSessionId;
        if (typeof id !== 'string' || !id || id.length > 512) return;
        const observation = this.observations.get(id) ?? { signal: {}, ids: new Set<string>(), at: Date.now() };
        observation.signal = { ...signal };
        observation.at = Date.now();
        for (const key of admittedIds.slice(0, 100)) if (observation.ids.size < 100) observation.ids.add(key);
        this.observations.delete(id); this.observations.set(id, observation);
        while (this.observations.size > 100) this.observations.delete(this.observations.keys().next().value!);
        this.applyObservation(id);
    }
    observeResend(id: string, admittedIds: string[]): void {
        this.observeSet({ peerDataRequestSessionId: id }, admittedIds);
    }
    observeStatus(signal: BaileysEventMap['messaging-history.status']): void {
        // rc14 status has NO request ID. Even explicit global completion cannot complete a specific request.
        this.lastStatus = { syncType: signal.syncType, status: signal.status, explicit: signal.explicit };
        this.expire();
    }
    interrupt(): void {
        for (const active of this.active.values()) {
            active.cancel('interrupted');
            if (active.scope !== this.access.scope()) continue;
            const record = this.store.requests().find(entry => entry.id === active.id);
            if (record && ['pending', 'partial'].includes(record.status)) this.store.saveRequest({ ...record, status: 'interrupted' });
        }
        this.active.clear(); this.observations.clear();
    }
    private applyObservation(id: string): void {
        const record = this.store.requests().find(entry => entry.id === id);
        const observation = this.observations.get(id);
        const active = record ? this.active.get(record.chat) : undefined;
        if (!record || !observation || !active || active.scope !== this.access.scope() || !['pending', 'partial'].includes(record.status)) return;
        const signal = observation.signal;
        record.imported = Math.max(record.imported, Math.min(record.count, observation.ids.size));
        record.status = 'partial';
        if (signal.progress != null && Number.isFinite(signal.progress) && signal.progress >= 0 && signal.progress <= 100) record.progress = Math.max(record.progress ?? 0, signal.progress);
        if (signal.syncType != null) record.syncType = signal.syncType;
        if (signal.chunkOrder != null) record.chunkOrder = Math.max(record.chunkOrder ?? 0, signal.chunkOrder);
        if (signal.syncType === proto.HistorySync.HistorySyncType.ON_DEMAND && signal.progress === 100) {
            record.status = 'complete'; record.explicit = true; this.active.delete(record.chat);
        }
        this.store.saveRequest(record);
    }
    private expire(): void {
        const now = Date.now();
        for (const [chat, active] of this.active) if (now - active.createdAt >= 60_000) {
            active.cancel('timeout');
            if (active.scope === this.access.scope()) {
                const record = this.store.requests().find(entry => entry.id === active.id);
                if (record && ['pending', 'partial'].includes(record.status)) this.store.saveRequest({ ...record, status: 'unknown' });
            }
            this.active.delete(chat);
        }
        for (const [id, observation] of this.observations) if (now - observation.at >= 60_000) this.observations.delete(id);
    }
}
