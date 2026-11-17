import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageStore } from '../../src/services/message-store.service.ts';
import { JidResolver } from '../../src/services/jid-resolver.service.ts';
import { MessageSender } from '../../src/services/message.sender.ts';
import { HistorySyncService } from '../../src/services/history-sync.service.ts';
import { WhatsAppService } from '../../src/services/whatsapp.service.ts';
import { RecentsService } from '../../src/services/recents.service.ts';
import type { SessionManager } from '../../src/services/session.manager.ts';
const key = { remoteJid: '15550000001@s.whatsapp.net', id: 'base', fromMe: false };
const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => { vi.restoreAllMocks(); for (const run of cleanup.splice(0).reverse()) await run(); });
async function fixture(extra = {}) {
    const root = await mkdtemp(join(tmpdir(), 'wa-review-')); cleanup.push(() => rm(root, { recursive: true, force: true }));
    const options = { root: join(root, 'archive'), authProfile: 'auth', legacyPath: join(root, 'old.json'), ...extra };
    const resolver = new JidResolver(() => store.reindex()); const store = new MessageStore(resolver, () => 'scope');
    cleanup.push(() => store.close()); await store.initialize(options); await store.activate('A', 'scope'); return { options, store, resolver };
}
describe('Phase 3 independent review regressions', () => {
    it('replaces aliases and conflicts across accounts and profiles', async () => {
        const { store, resolver, options } = await fixture(); resolver.bind('999@lid', key.remoteJid); resolver.bind('998@lid', key.remoteJid); await store.flush();
        await store.activate('B', 'scope'); expect(resolver.exportState()).toEqual({ aliases: [], conflicts: [] });
        expect(resolver.canonical('999@lid')).toBe('999@lid');
        resolver.bind('997@lid', key.remoteJid); await store.flush(); await store.initialize({ ...options, authProfile: 'another-auth' }); await store.activate('B', 'scope');
        expect(resolver.exportState()).toEqual({ aliases: [], conflicts: [] });
    });
    it('enforces raw admission timestamps when clocks advance during local deletion', async () => {
        const { store } = await fixture(); const now = Date.now(); store.put({ key, messageTimestamp: now - 2000, message: { conversation: 'old' } });
        let clock = now; vi.spyOn(Date, 'now').mockImplementation(() => clock++); store.clearChat(key.remoteJid);
        expect(store.getForTransport(key)).toBeUndefined(); expect(store.find(key.remoteJid, key.id)).toBeUndefined();
    });
    it('count pressure cannot expose an evicted old raw quote or retry', async () => {
        const { store } = await fixture({ maxRecords: 1 }); const now = Date.now();
        store.put({ key, messageTimestamp: now - 2000, message: { conversation: 'old' } });
        store.put({ key: { ...key, id: 'new' }, messageTimestamp: now, message: { conversation: 'new' } });
        expect(store.getForTransport(key)).toBeUndefined(); expect(store.find(key.remoteJid, key.id)).toBeUndefined();
    });
    it('pending edits and original-history overlaps cannot resurrect stale quoted text', async () => {
        const { store } = await fixture(); store.reconcile({ key, text: 'edited', editedAt: 20 }); store.put({ key, message: { conversation: 'original' } });
        expect(store.find(key.remoteJid, key.id)?.message).toEqual({ conversation: 'edited' });
        store.put({ key, message: { conversation: 'original' } }); expect(store.find(key.remoteJid, key.id)?.message).toEqual({ conversation: 'edited' });
    });
    it.each(['quote', 'socket'] as const)('revalidates %s after persistence awaits before any transmission', async kind => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        let release!: () => void; let enter!: () => void; const entered = new Promise<void>(r => { enter = r; });
        const sent = vi.fn().mockResolvedValue({ key: { id: 'sent' }, message: { conversation: 'reply' } });
        let socket: object = { sendMessage: sent }; let quoted: object | undefined = { key, message: { conversation: 'original' } };
        const service = { getStatus: () => 'connected', getSessionContext: () => ({ accountScope: 'scope', generation: 0 }),
            isSessionContextCurrent: () => true, getSocket: () => socket, getQuotedMessage: () => quoted,
            registerOutgoing: vi.fn(), cacheSentMessage: vi.fn(), recordSendOutcome: vi.fn(), isVerbose: () => false,
            flushArchive: () => new Promise<void>(r => { release = r; enter(); }) };
        const pending = new MessageSender(service as unknown as WhatsAppService).send({ recipientJid: key.remoteJid, text: 'reply', quote: { messageId: key.id }, options: { maxRetries: 1 } });
        await entered; if (kind === 'quote') quoted = undefined; else socket = { sendMessage: vi.fn() }; release();
        expect((await pending).success).toBe(false); expect(sent).not.toHaveBeenCalled();
    });
    it('never archives ignored live content or makes it quotable', async () => {
        const { store, options } = await fixture(); await store.close();
        const session = { getStatus: () => 'connected', isConversationAllowed: () => false, trackIgnoredNumber: vi.fn(), getArchiveStorageOptions: () => options } as unknown as SessionManager;
        const service = new WhatsAppService(session); Object.assign(service, { socket: { user: { id: 'self@s.whatsapp.net' } } });
        const recents = new RecentsService(session); service.setRecentsService(recents); await service.prepareArchive(); cleanup.push(() => recents.getMessageStore()!.close());
        await service.handleIncomingMessages({ type: 'notify', messages: [{ key, message: { conversation: 'IGNORED_PRIVATE_TEXT' }, messageTimestamp: Date.now() }] });
        const archive = recents.getMessageStore()!; await archive.flush();
        expect(archive.listRecords()).toEqual([]); expect(archive.getForTransport(key)).toBeUndefined(); expect(service.getQuotedMessage(key.remoteJid, { messageId: key.id })).toBeUndefined();
        expect(await readFile(archive.getArchiveState().path!, 'utf8')).not.toContain('IGNORED_PRIVATE_TEXT');
    });
    it.each(['incomplete', 'progress', 'syncType', 'chunkOrder', 'explicit'])('rejects nested objects in scalar %s without rewriting originals', async slot => {
        const { store, options } = await fixture(); store.put({ key, message: { conversation: 'text' } }); await store.flush(); const path = store.getArchiveState().path!; await store.close();
        const data = JSON.parse(await readFile(path, 'utf8'));
        if (slot === 'incomplete') data.records[0].incomplete = { mediaKey: 'secret-shaped' };
        else { data.requests = [{ id: 'req', chat: key.remoteJid, anchor: key, createdAt: Date.now(), status: 'unknown', count: 1, imported: 0, [slot]: { mediaKey: 'secret-shaped' } }]; }
        const original = JSON.stringify(data); await writeFile(path, original);
        const next = new MessageStore(new JidResolver(), () => 'scope'); cleanup.push(() => next.close()); await next.initialize(options);
        expect(next.getArchiveState().degraded).toBeTruthy(); expect(await readFile(path, 'utf8')).toBe(original);
    });
    it('unconfirmed outgoing intents cannot supply an observed network history anchor after restart', async () => {
        const { store, options } = await fixture(); store.recordIntent({ key: { ...key, fromMe: true }, message: { conversation: 'not confirmed' } }); await store.flush(); await store.close();
        const next = new MessageStore(new JidResolver(), () => 'scope'); cleanup.push(() => next.close()); await next.initialize(options);
        const fetch = vi.fn(); const history = new HistorySyncService(next, { canonical: jid => jid, allowed: () => true, connected: () => true, scope: () => 'scope', fetch });
        expect((await history.request(key.remoteJid, 1)).success).toBe(false); expect(fetch).not.toHaveBeenCalled();
    });
});
