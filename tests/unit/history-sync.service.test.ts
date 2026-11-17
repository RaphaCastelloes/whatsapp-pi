import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { proto } from 'baileys';
import { MessageStore } from '../../src/services/message-store.service.ts';
import { JidResolver } from '../../src/services/jid-resolver.service.ts';
import { HistorySyncService } from '../../src/services/history-sync.service.ts';

const key = { remoteJid: '15550000001@s.whatsapp.net', id: 'anchor', fromMe: false };
const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => { vi.restoreAllMocks(); for (const run of cleanup.splice(0).reverse()) await run(); });
async function fixture(anchor = true) {
    const root = await mkdtemp(join(tmpdir(), 'wa-history-')); cleanup.push(() => rm(root, { recursive: true, force: true }));
    const options = { root: join(root, 'archive'), authProfile: 'auth', legacyPath: join(root, 'legacy.json') };
    const store = new MessageStore(new JidResolver(), () => 'scope'); await store.initialize(options); await store.activate('self', 'scope'); cleanup.push(() => store.close());
    if (anchor) store.put({ key, messageTimestamp: Date.now() - 1000, message: { conversation: 'oldest' } });
    const state = { allowed: true, online: true, scope: 'A' };
    const fetch = vi.fn().mockResolvedValue('transport-request');
    const service = new HistorySyncService(store, { canonical: jid => new JidResolver().canonical(jid), allowed: () => state.allowed,
        connected: () => state.online, scope: () => state.scope, fetch });
    return { store, service, state, fetch, options };
}

describe('explicit bounded network history requests', () => {
    it('validates permissions, connection, count and complete retained anchors before network work', async () => {
        const { service, state, fetch } = await fixture(false);
        expect((await service.request(key.remoteJid, 101)).success).toBe(false);
        state.allowed = false; expect((await service.request(key.remoteJid, 3)).success).toBe(false);
        state.allowed = true; state.online = false; expect((await service.request(key.remoteJid, 3)).success).toBe(false);
        state.online = true; expect((await service.request(key.remoteJid, 3)).success).toBe(false); expect(fetch).not.toHaveBeenCalled();
    });
    it('returns the fetch ID as pending, uses milliseconds, and reserves the active slot before awaiting fetch', async () => {
        const { service, fetch } = await fixture();
        let resolve!: (id: string) => void; fetch.mockImplementation(() => new Promise<string>(r => { resolve = r; }));
        const first = service.request(key.remoteJid, 3);
        expect((await service.request(key.remoteJid, 3)).success).toBe(false);
        resolve('actual-id'); const result = await first; expect(result).toMatchObject({ success: true, request: { id: 'actual-id', status: 'pending' } });
        expect(fetch.mock.calls[0][2]).toBeGreaterThan(1_000_000_000_000);
    });
    it('generic explicit completion and unrelated peer session IDs never complete a request', async () => {
        const { service } = await fixture(); await service.request(key.remoteJid, 3);
        service.observeStatus({ syncType: proto.HistorySync.HistorySyncType.ON_DEMAND, status: 'complete', explicit: true });
        service.observeSet({ peerDataRequestSessionId: 'different', isLatest: true, progress: 100, syncType: proto.HistorySync.HistorySyncType.ON_DEMAND }, ['one']);
        expect(service.status('transport-request')?.status).toBe('pending');
        service.observeSet({ peerDataRequestSessionId: 'transport-request', isLatest: false, progress: 30, chunkOrder: 1, syncType: proto.HistorySync.HistorySyncType.ON_DEMAND }, ['one']);
        expect(service.status('transport-request')).toMatchObject({ status: 'partial', imported: 1, progress: 30 });
        service.observeSet({ peerDataRequestSessionId: 'transport-request', progress: 100, chunkOrder: 2, syncType: proto.HistorySync.HistorySyncType.ON_DEMAND }, ['one', 'two']);
        expect(service.status('transport-request')).toMatchObject({ status: 'complete', imported: 2, explicit: true });
    });
    it('times out truthfully, preserves late import observation without inventing completion, and allows a fresh request', async () => {
        const { service } = await fixture(); const start = Date.now(); await service.request(key.remoteJid, 3);
        vi.spyOn(Date, 'now').mockReturnValue(start + 60_001);
        expect(service.status('transport-request')?.status).toBe('unknown');
        service.observeResend('transport-request', ['late']); expect(service.status('transport-request')?.status).toBe('unknown');
        expect((await service.request(key.remoteJid, 3)).success).toBe(true);
    });
    it('interrupts disconnect/restart work without resubmission and stores no transport objects', async () => {
        const { service, store, options, fetch } = await fixture(); await service.request(key.remoteJid, 3);
        service.interrupt(); expect(service.status('transport-request')?.status).toBe('interrupted');
        await store.flush(); await store.close();
        const restarted = new MessageStore(new JidResolver(), () => 'scope'); cleanup.push(() => restarted.close()); await restarted.initialize(options);
        expect(restarted.requests()[0].status).toBe('interrupted'); expect(fetch).toHaveBeenCalledTimes(1);
    });
    it('late fetch completion cannot write into a replacement account scope', async () => {
        const { service, fetch, state, store } = await fixture();
        let resolve!: (id: string) => void; fetch.mockImplementation(() => new Promise<string>(r => { resolve = r; }));
        const pending = service.request(key.remoteJid, 3); service.interrupt(); state.scope = 'B';
        await store.activate('other-self', 'scope'); resolve('late-id');
        expect((await pending).success).toBe(false); expect(store.requests()).toEqual([]);
    });
});
