import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageStore } from '../../src/services/message-store.service.ts';
import { JidResolver } from '../../src/services/jid-resolver.service.ts';
import { RecentsService } from '../../src/services/recents.service.ts';
import type { SessionManager } from '../../src/services/session.manager.ts';

const cleanups: Array<() => Promise<unknown>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
async function fixture() {
    const root = await mkdtemp(join(tmpdir(), 'wa-recent-archive-')); cleanups.push(() => rm(root, { recursive: true, force: true }));
    const options = { root: join(root, 'archive'), authProfile: 'auth', legacyPath: join(root, 'old.json') };
    const session = { getArchiveStorageOptions: () => options, isConversationAllowed: () => true } as unknown as SessionManager;
    const store = new MessageStore(new JidResolver(), () => 'scope');
    const recents = new RecentsService(session); recents.useMessageStore(store);
    await recents.ensureInitialized(); await recents.bindAccount('A', 'scope'); cleanups.push(() => store.close());
    return { store, recents, options, session };
}
const key = { remoteJid: '15550000001@s.whatsapp.net', fromMe: false };

describe('authoritative recents projection', () => {
    it('preserves emoji-only text, exact whitespace/newlines and scoped lifecycle metadata', async () => {
        const { store, recents } = await fixture();
        store.put({ key: { ...key, id: 'one' }, message: { conversation: '  👋\n😊  ' } });
        await recents.recordMessage({ messageId: 'one', senderNumber: '+15550000001', text: 'not authoritative', direction: 'incoming', timestamp: Date.now(), senderName: 'Name' });
        const records = await recents.getConversationHistory('+15550000001'); expect(records[0].text).toBe('  👋\n😊  ');
        store.reconcile({ key: { ...key, id: 'one' }, text: 'edited 😊', editedAt: 100 });
        expect((await recents.getConversationHistory('+15550000001'))[0].editedAt).toBe(100);
        expect((await recents.getRecentConversations())[0].lastMessagePreview).toBe('edited');
    });
    it('paginates equal timestamps deterministically and rejects cross-chat/account cursors', async () => {
        const { store, recents } = await fixture(); const timestamp = Date.now();
        for (let i = 0; i < 45; i++) store.put({ key: { ...key, id: String(i).padStart(3, '0') }, messageTimestamp: timestamp, message: { conversation: String(i) } });
        const first = await recents.getHistoryPage('+15550000001'); const second = await recents.getHistoryPage('+15550000001', { cursor: first.nextCursor });
        expect(first.messages).toHaveLength(20); expect(second.messages).toHaveLength(20);
        expect(new Set([...first.messages, ...second.messages].map(m => m.messageId)).size).toBe(40);
        await expect(recents.getHistoryPage('+15550000002', { cursor: first.nextCursor })).rejects.toThrow();
        await recents.bindAccount('B', 'scope'); await expect(recents.getHistoryPage('+15550000001', { cursor: first.nextCursor })).rejects.toThrow();
    });
    it('does not change ingestion account when a historical account is selected; disables cross-account quotes', async () => {
        const { store, recents } = await fixture(); store.put({ key: { ...key, id: 'old' }, message: { conversation: 'A' } }); await store.flush();
        const scopeA = (await recents.getHistoryScopes()).find(s => s.account === 'A')!.id;
        await recents.bindAccount('B', 'scope'); await recents.selectHistoryScope(scopeA);
        expect((await recents.getConversationHistory('+15550000001'))[0]).toMatchObject({ text: 'A', quoteAvailable: false });
        store.put({ key: { ...key, id: 'new' }, message: { conversation: 'B' } }); expect(store.listRecords()[0].text).toBe('B');
    });
    it('retains offline views after closing and reopening without any socket/auth calls', async () => {
        const { store, recents, session } = await fixture(); store.put({ key: { ...key, id: 'one' }, message: { conversation: 'offline' } }); await store.flush(); await store.close();
        const restarted = new RecentsService(session); await restarted.ensureInitialized(); cleanups.push(() => restarted.getMessageStore()!.close());
        expect((await restarted.getConversationHistory('+15550000001'))[0].text).toBe('offline'); expect(await restarted.getHistoryScopes()).toHaveLength(2);
        expect(recents.getArchiveState()?.path).toBeUndefined();
    });
});
