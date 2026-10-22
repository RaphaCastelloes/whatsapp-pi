import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageStore } from '../../src/services/message-store.service.ts';
import { JidResolver } from '../../src/services/jid-resolver.service.ts';
import type { ArchiveOptions } from '../../src/models/message-archive.types.ts';

const key = { remoteJid: '15550000001@s.whatsapp.net', id: 'base', fromMe: false };
const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => { for (const run of cleanup.splice(0).reverse()) await run(); });
async function setup(extra: Partial<ArchiveOptions> = {}) {
    const root = await mkdtemp(join(tmpdir(), 'wa-retention-')); cleanup.push(() => rm(root, { recursive: true, force: true }));
    const options = { root: join(root, 'archive'), authProfile: 'auth', legacyPath: join(root, 'old.json'), ...extra };
    const resolver = new JidResolver(() => store.reindex()); const store = new MessageStore(resolver, () => 'scope');
    await store.initialize(options); await store.activate('self', 'scope'); cleanup.push(() => store.close());
    return { store, resolver, options };
}

describe('retention, safe projections and admission protection', () => {
    it('rejects an archive carrying unexpected raw media/context fields without overwriting it', async () => {
        const { store, options } = await setup(); store.put({ key, message: { conversation: 'visible' } }); await store.flush();
        const path = store.getArchiveState().path!; await store.close();
        const corrupt = JSON.parse(await readFile(path, 'utf8')); corrupt.records[0].quote = { imageMessage: { caption: 'text', mediaKey: 'DO_NOT_REWRITE' } };
        const original = JSON.stringify(corrupt); await writeFile(path, original);
        const next = new MessageStore(new JidResolver(), () => 'scope'); cleanup.push(() => next.close()); await next.initialize(options);
        expect(next.getArchiveState().degraded).toBeTruthy(); expect(await readFile(path, 'utf8')).toBe(original);
    });
    it('delete-before-base and tombstone pressure prevent resurrection on live and history paths after restart', async () => {
        const { store, options } = await setup({ maxTombstones: 1 });
        const time = Date.now() - 2000;
        store.reconcile({ key, deleted: 'remote' });
        store.put({ key, messageTimestamp: time, message: { conversation: 'deleted' } });
        store.reconcile({ key: { ...key, id: 'other' }, deleted: 'local' });
        expect(store.accepts(key, time)).toBe(false); await store.flush(); await store.close();
        const next = new MessageStore(new JidResolver(), () => 'scope'); cleanup.push(() => next.close()); await next.initialize(options);
        next.put({ key, messageTimestamp: time, message: { conversation: 'must not return' } });
        expect(next.find(key.remoteJid, key.id)).toBeUndefined(); expect(next.listRecords()).toEqual([]);
    });
    it('chat-wide deletion raises only its own persisted floor', async () => {
        const { store } = await setup(); const time = Date.now() - 2000;
        for (const jid of [key.remoteJid, '15550000002@s.whatsapp.net']) store.put({ key: { ...key, remoteJid: jid }, messageTimestamp: time, message: { conversation: jid } });
        store.clearChat(key.remoteJid);
        expect(store.listRecords().map(record => record.key.remoteJid)).toEqual(['15550000002@s.whatsapp.net']);
        expect(store.get(key)).toBeUndefined();
    });
    it('bounds count and bytes with persisted admission floors rather than permitting endless reimport', async () => {
        const { store } = await setup({ maxRecords: 2, maxBytes: 3000 });
        for (let i = 0; i < 5; i++) store.put({ key: { ...key, id: String(i) }, messageTimestamp: Date.now() - 5000 + i, message: { conversation: String(i).repeat(100) } });
        expect(store.listRecords()).toHaveLength(2); expect(store.accepts({ ...key, id: '0' }, Date.now() - 6000)).toBe(false);
        await store.flush(); expect(Buffer.byteLength(await readFile(store.getArchiveState().path!, 'utf8'))).toBeLessThanOrEqual(3000);
    });
    it('late verified aliases reindex records, pending state and deletion protection atomically', async () => {
        const { store, resolver } = await setup(); const lid = '999999999@lid';
        store.reconcile({ key: { ...key, remoteJid: lid }, text: 'edited', editedAt: 20 });
        store.put({ key, message: { conversation: 'original' } });
        resolver.bind(lid, key.remoteJid);
        expect(store.find(key.remoteJid, key.id)?.message).toEqual({ conversation: 'edited' });
        store.reconcile({ key: { ...key, remoteJid: lid }, deleted: 'remote' });
        expect(store.get(key)).toBeUndefined();
    });
    it('view-once never enters either cache and protocol-expired content cannot be revived', async () => {
        const { store } = await setup();
        store.put({ key, message: { imageMessage: { viewOnce: true, caption: 'private' } } }); expect(store.listRecords()).toEqual([]);
        store.put({ key, messageTimestamp: Date.now() - 5000, message: { extendedTextMessage: { text: 'expired', contextInfo: { expiration: 1 } } } });
        expect(store.get(key)).toBeUndefined(); expect(store.listRecords()).toEqual([]);
    });
    it('retains monotonic per-participant receipts and deterministic reaction removal without group-wide read claims', async () => {
        const { store } = await setup(); const group = { ...key, remoteJid: 'group@g.us', fromMe: true, participant: 'self@s.whatsapp.net' };
        store.put({ key: group, message: { conversation: 'base' } });
        store.reconcile({ key: group, receipt: { participant: 'reader@s.whatsapp.net', readAt: 300 } });
        store.reconcile({ key: group, receipt: { participant: 'reader@s.whatsapp.net', readAt: 100, deliveredAt: 200 } });
        store.reconcile({ key: group, reaction: { participant: 'reader@s.whatsapp.net', text: '', timestamp: 20 } });
        store.reconcile({ key: group, reaction: { participant: 'reader@s.whatsapp.net', text: '👍', timestamp: 10 } });
        const record = store.listRecords()[0]; expect(record.status).toBeUndefined();
        expect(record.receipts).toEqual({ 'reader@s.whatsapp.net': { readAt: 300, deliveredAt: 200 } });
        expect(record.reactions?.['reader@s.whatsapp.net'].text).toBe('');
    });
});
