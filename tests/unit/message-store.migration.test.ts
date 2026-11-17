import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile, mkdir, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageStore } from '../../src/services/message-store.service.ts';
import { JidResolver } from '../../src/services/jid-resolver.service.ts';

const key = { remoteJid: '15550000001@s.whatsapp.net', id: 'one', fromMe: false };
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
    const root = await mkdtemp(join(tmpdir(), 'wa-archive-test-')); roots.push(root);
    return { root: join(root, 'archive'), authProfile: 'auth', legacyPath: join(root, 'recents.json') };
}
async function open(options: Awaited<ReturnType<typeof fixture>>) {
    const store = new MessageStore(new JidResolver(), () => 'scope');
    await store.initialize(options); return store;
}

describe('authoritative archive and offline partitions', () => {
    it('survives restart with exact visible content, safe quotes, but no raw retry envelopes', async () => {
        const options = await fixture(); const store = await open(options);
        await store.activate('self', 'scope');
        store.put({ key, message: { imageMessage: { caption: '  hi 👋\n😊  ', mimetype: 'image/png', url: 'SECRET_URL', directPath: 'SECRET_PATH', mediaKey: new Uint8Array([77]), jpegThumbnail: new Uint8Array([78]), contextInfo: { quotedMessage: { conversation: 'SECRET_CONTEXT' } } } } });
        store.recordProcessing(key, 'handed-off'); await store.flush();
        const path = store.getArchiveState().path!;
        const serialized = await readFile(path, 'utf8');
        expect(serialized).not.toMatch(/SECRET|mediaKey|directPath|jpegThumbnail|quotedMessage/);
        expect((await stat(path)).mode & 0o777).toBe(0o600);
        await store.close();
        const restarted = await open(options);
        expect(restarted.listRecords()[0].text).toBe('  hi 👋\n😊  ');
        expect(restarted.find(key.remoteJid, key.id)?.message).toEqual({ imageMessage: { caption: '  hi 👋\n😊  ', mimetype: 'image/png' } });
        expect(restarted.getForTransport(key)).toBeUndefined();
        expect(restarted.getProcessing(key)).toBe('interrupted');
        await restarted.close();
    });
    it('imports legacy once, read-only and unassigned; never adopts it on first verified login', async () => {
        const options = await fixture();
        const original = JSON.stringify({ conversations: [{ senderNumber: '+15550000001', senderName: 'Label' }], messagesBySender: { '+15550000001': [{ messageId: 'old', senderNumber: '+15550000001', text: 'legacy', timestamp: Date.now(), direction: 'incoming' }] } });
        await writeFile(options.legacyPath, original);
        const store = await open(options);
        expect((await store.historyRecords('legacy-unassigned'))[0].text).toBe('legacy');
        expect(await readFile(options.legacyPath, 'utf8')).toBe(original);
        await store.activate('self', 'scope'); expect(store.listRecords()).toEqual([]);
        expect((await store.historyRecords('legacy-unassigned'))[0].senderName).toBe('Label');
        await store.close();
        const restarted = await open(options); expect(restarted.listRecords()).toEqual([]);
        expect(await readFile(options.legacyPath + '.pre-archive-backup', 'utf8')).toBe(original);
        await restarted.close();
    });
    it('selects the last verified account offline and isolates a new account', async () => {
        const options = await fixture(); const store = await open(options);
        await store.activate('A', 'scope'); store.put({ key, message: { conversation: 'A only' } }); await store.flush();
        await store.activate('B', 'scope'); expect(store.listRecords()).toEqual([]);
        const scopes = await store.listHistoryScopes(); expect(scopes.filter(s => s.account)).toHaveLength(2);
        expect((await store.historyRecords(scopes.find(s => s.account === 'A')!.id))[0].text).toBe('A only');
        await store.close(); const restarted = await open(options);
        expect(restarted.listRecords()).toEqual([]); expect(restarted.getArchiveState().account).toBe('B'); await restarted.close();
    });
    it('preserves corrupt/future files and reports degraded instead of resetting', async () => {
        for (const corrupt of ['not json', '{"version":99}']) {
            const options = await fixture(); const store = await open(options); await store.activate('self', 'scope'); await store.flush();
            const path = store.getArchiveState().path!; await store.close(); await writeFile(path, corrupt);
            const restarted = await open(options); expect(restarted.getArchiveState().degraded).toBeTruthy();
            restarted.put({ key, message: { conversation: 'must not overwrite' } }); await restarted.flush();
            expect(await readFile(path, 'utf8')).toBe(corrupt); await restarted.close();
        }
    });
    it('serializes concurrent writes and rejects a second writer without changing committed data', async () => {
        const options = await fixture(); const store = await open(options); await store.activate('self', 'scope');
        await Promise.all(Array.from({ length: 20 }, async (_, i) => { store.put({ key: { ...key, id: String(i) }, message: { conversation: `line ${i}` } }); await store.flush(); }));
        const second = await open(options); expect(second.getArchiveState().degraded).toBeTruthy();
        expect(store.listRecords()).toHaveLength(20); await second.close(); await store.close();
        const restarted = await open(options); expect(restarted.listRecords()).toHaveLength(20); await restarted.close();
    });
    it('rename failure retains the last committed snapshot and disables further writes', async () => {
        const options = await fixture(); const store = await open(options); await store.activate('self', 'scope');
        const path = store.getArchiveState().path!; const committed = await readFile(path, 'utf8');
        await rm(path); await mkdir(path); // deterministic failed atomic replacement
        store.put({ key, message: { conversation: 'uncommitted' } }); await store.flush();
        expect(store.getArchiveState().degraded).toBeTruthy(); expect((await stat(path)).isDirectory()).toBe(true);
        expect(JSON.parse(committed).records).toEqual([]); await store.close();
    });
});
