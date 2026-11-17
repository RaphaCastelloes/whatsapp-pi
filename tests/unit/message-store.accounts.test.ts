import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MessageStore } from '../../src/services/message-store.service.ts';
import { JidResolver } from '../../src/services/jid-resolver.service.ts';
const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => { for (const run of cleanup.splice(0).reverse()) await run(); });
async function fixture() {
    const root = await mkdtemp(join(tmpdir(), 'wa-accounts-')); cleanup.push(() => rm(root, { recursive: true, force: true }));
    const options = { root: join(root, 'archive'), authProfile: 'auth', legacyPath: join(root, 'old.json') };
    const store = new MessageStore(new JidResolver(), () => 'scope'); cleanup.push(() => store.close()); await store.initialize(options); await store.activate('self', 'scope');
    return { options, store };
}
describe('account/profile and outgoing intent lifetimes', () => {
    it('recognizes retained extension-owned outgoing echoes after restart without retaining raw payloads', async () => {
        const { store, options } = await fixture(); const key = { remoteJid: '15550000001@s.whatsapp.net', id: 'owned', fromMe: true };
        store.recordIntent({ key, message: { documentMessage: { fileName: 'example.pdf', mimetype: 'application/pdf' } } });
        store.put({ key, message: { documentMessage: { fileName: 'example.pdf', mimetype: 'application/pdf' } } });
        store.recordOutcome(key, { success: true, attempts: 1, messageId: key.id }); await store.flush(); await store.close();
        const next = new MessageStore(new JidResolver(), () => 'scope'); cleanup.push(() => next.close()); await next.initialize(options);
        expect(next.isOwn(key)).toBe(true); expect(next.getForTransport(key)).toBeUndefined(); expect(next.isOwn({ ...key, fromMe: false })).toBe(false);
    });
    it('does not share a partition when the relative auth-directory profile changes', async () => {
        const { store, options } = await fixture(); const key = { remoteJid: '15550000001@s.whatsapp.net', id: 'one', fromMe: false };
        store.put({ key, message: { conversation: 'first profile' } }); await store.flush(); const first = store.getArchiveState().scopeId;
        await store.initialize({ ...options, authProfile: 'auth-group' }); await store.activate('self', 'scope');
        expect(store.getArchiveState().scopeId).not.toBe(first); expect(store.listRecords()).toEqual([]);
    });
    it('persists an uncertain outgoing intent without making up a quote, then completes the observed group key once', async () => {
        const { store } = await fixture(); const key = { remoteJid: 'group@g.us', id: 'send', fromMe: true };
        store.recordIntent({ key, message: { conversation: 'generated content' } }); await store.flush();
        expect(store.listRecords()[0].sendState).toBe('unknown'); expect(store.find('group@g.us', 'send')).toBeUndefined();
        store.put({ key: { ...key, participant: 'self@s.whatsapp.net' }, message: { conversation: 'generated content' } });
        store.recordOutcome(key, { success: true, attempts: 1, messageId: key.id });
        expect(store.listRecords()).toHaveLength(1); expect(store.listRecords()[0]).toMatchObject({ key: { participant: 'self@s.whatsapp.net' }, sendState: 'accepted' });
    });
});
