import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { proto, type WAMessageKey } from 'baileys';
import { WhatsAppService } from '../../src/services/whatsapp.service.ts';
import { RecentsService } from '../../src/services/recents.service.ts';
import type { SessionManager } from '../../src/services/session.manager.ts';

const peer = '15550000001@s.whatsapp.net'; const self = '15559999999@s.whatsapp.net';
const key = { remoteJid: peer, id: 'base', fromMe: false };
const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => { for (const run of cleanup.splice(0).reverse()) await run(); });
async function fixture() {
    const root = await mkdtemp(join(tmpdir(), 'wa-life-')); cleanup.push(() => rm(root, { recursive: true, force: true }));
    const session = { getStatus: () => 'connected', isConversationAllowed: (jid: string) => jid === '+15550000001' || jid === 'group@g.us',
        getArchiveStorageOptions: () => ({ root: join(root, 'archive'), authProfile: 'auth', legacyPath: join(root, 'old.json') }) } as unknown as SessionManager;
    const handlers = new Map<string, (payload: unknown) => void>();
    const socket = { user: { id: self }, ev: { on: (name: string, callback: (payload: unknown) => void) => handlers.set(name, callback), removeAllListeners: vi.fn() },
        fetchMessageHistory: vi.fn().mockResolvedValue('network-id'), end: vi.fn() };
    const service = new WhatsAppService(session); Object.assign(service, { socket });
    const recents = new RecentsService(session); service.setRecentsService(recents); await service.prepareArchive();
    cleanup.push(() => recents.getMessageStore()!.close());
    const internal = service as unknown as { registerSocketListeners(socket: unknown, options: object, save: () => Promise<void>): void };
    internal.registerSocketListeners(socket, {}, async () => {});
    const callback = vi.fn(); service.setMessageCallback(callback);
    const ingest = (id = 'base', jid = peer, fromMe = false) => service.handleIncomingMessages({ type: 'append', messages: [{ key: { id, remoteJid: jid, fromMe }, message: { conversation: 'original 😊\nline' }, messageTimestamp: Date.now() }] });
    return { service, recents, callback, handlers, socket, ingest };
}

describe('typed history/lifecycle socket integration', () => {
    it('imports all permitted history including own branded text, but never triggers Pi or imports ignored chats', async () => {
        const { service, recents, callback } = await fixture();
        await service.handleHistorySet({ chats: [], contacts: [], messages: [
            { key, message: { conversation: 'history 😊' }, messageTimestamp: Date.now() },
            { key: { ...key, id: 'own', fromMe: true }, message: { conversation: 'own π' }, messageTimestamp: Date.now() },
            { key: { ...key, remoteJid: '15550000002@s.whatsapp.net' }, message: { conversation: 'ignored' }, messageTimestamp: Date.now() }
        ] });
        expect(callback).not.toHaveBeenCalled(); const history = await recents.getConversationHistory(peer);
        expect(history.map(message => message.text).sort()).toEqual(['history 😊', 'own π'].sort());
        expect(await recents.getConversationHistory('+15550000002')).toEqual([]);
    });
    it('reconciles edit-before-base and native wrapped edits with original timestamp units', async () => {
        const { service, recents, callback, handlers, ingest } = await fixture();
        await service.handleLifecycle([{ key, text: 'before-base', editedAt: 100 }]); await ingest();
        expect((await recents.getConversationHistory(peer))[0].text).toBe('before-base');
        handlers.get('messages.update')!([{ key, update: { message: { editedMessage: { message: { conversation: 'new 😊' } } }, messageTimestamp: 1_800_000_000 } }]);
        await vi.waitFor(async () => expect((await recents.getConversationHistory(peer))[0].text).toBe('new 😊'));
        expect((await recents.getConversationHistory(peer))[0].editedAt).toBe(1_800_000_000_000); expect(callback).not.toHaveBeenCalled();
    });
    it('revokes content and safe/raw quoting, blocks delayed notify and keeps local chat deletion scoped', async () => {
        const { service, recents, callback, ingest } = await fixture(); await ingest();
        await service.handleLifecycle([{ key, deleted: 'remote' }]);
        expect(service.getQuotedMessage(peer, { messageId: key.id })).toBeUndefined();
        await service.handleIncomingMessages({ type: 'notify', messages: [{ key, message: { conversation: 'must not reappear' }, messageTimestamp: Date.now() }] });
        expect(callback).not.toHaveBeenCalled(); expect((await recents.getConversationHistory(peer))[0].deleted).toBe('remote');
        service.invalidateMessage({ remoteJid: peer }); expect(await recents.getConversationHistory(peer)).toEqual([]);
    });
    it('records group receipts only for the observed participant and merges raw/dedicated reactions once', async () => {
        const { service, recents, handlers, callback } = await fixture();
        const group: WAMessageKey = { remoteJid: 'group@g.us', id: 'group-message', fromMe: true, participant: self };
        service.cacheSentMessage(group.id, { conversation: 'group' }, group);
        handlers.get('message-receipt.update')!([{ key: { remoteJid: group.remoteJid, id: group.id, fromMe: true }, receipt: { userJid: peer, readTimestamp: 10 } }]);
        await vi.waitFor(async () => expect((await recents.getConversationHistory('group@g.us'))[0].receipts?.[peer].readAt).toBe(10000));
        await service.handleIncomingMessages({ type: 'notify', messages: [{ key: { remoteJid: 'group@g.us', id: 'reaction', fromMe: false, participant: peer }, message: { reactionMessage: { key: group, text: '👍', senderTimestampMs: 100 } } }] });
        handlers.get('messages.reaction')!([{ key: group, reaction: { key: { remoteJid: 'group@g.us', id: 'reaction', fromMe: false, participant: peer }, text: '👍', senderTimestampMs: 100 } }]);
        await vi.waitFor(async () => expect((await recents.getConversationHistory('group@g.us'))[0].reactions?.[peer].text).toBe('👍'));
        const record = (await recents.getConversationHistory('group@g.us'))[0]; expect(Object.keys(record.reactions!)).toEqual([peer]); expect(record.status).toBeUndefined(); expect(callback).not.toHaveBeenCalled();
    });
    it('resends carrying request IDs remain import-only and global completion stays uncorrelated', async () => {
        const { service, ingest, callback, handlers } = await fixture(); await ingest();
        expect((await service.requestHistory(peer, 3)).request?.status).toBe('pending');
        await service.handleIncomingMessages({ type: 'notify', requestId: 'network-id', messages: [{ key: { ...key, id: 'older' }, message: { conversation: 'backfill' }, messageTimestamp: Date.now() - 2000 }] });
        handlers.get('messaging-history.status')!({ syncType: proto.HistorySync.HistorySyncType.ON_DEMAND, status: 'complete', explicit: true });
        expect((await service.getHistoryStatus('network-id')).request?.status).toBe('partial'); expect(callback).not.toHaveBeenCalled();
    });
    it('rejects stale socket callbacks after reconnect cleanup', async () => {
        const { service, handlers, recents, ingest } = await fixture(); await ingest(); Object.assign(service, { socket: { user: { id: self } } });
        handlers.get('messages.update')!([{ key, update: { message: null } }]);
        await Promise.resolve(); expect((await recents.getConversationHistory(peer))[0].deleted).toBeUndefined();
    });
});
