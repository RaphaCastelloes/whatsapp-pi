import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WhatsAppService } from '../../src/services/whatsapp.service.ts';
import { OutgoingMediaService } from '../../src/services/outgoing-media.service.ts';
import { showMessageReplyView } from '../../src/ui/message-reply.view.ts';
import type { SessionManager } from '../../src/services/session.manager.ts';

const jid = '15550000001@s.whatsapp.net';

describe('explicit media preparation → shared transport integration', () => {
    let root: string;
    let service: WhatsAppService;
    const sendMessage = vi.fn();
    beforeEach(async () => {
        vi.clearAllMocks();
        root = await mkdtemp(join(tmpdir(), 'wa-media-send-'));
        const session = { getStatus: () => 'connected', getAllowedContact: () => undefined, isConversationAllowed: () => true };
        service = new WhatsAppService(session as unknown as SessionManager);
        Object.assign(service, { socket: { user: { id: '15559999999@s.whatsapp.net' }, sendMessage } });
    });
    afterEach(async () => { await rm(root, { recursive: true, force: true }); });
    it('streams a validated document snapshot through the real sender and stores the full returned key', async () => {
        const path = join(root, 'test report.pdf');
        await writeFile(path, '%PDF-1.4\nNON-SENSITIVE TEST');
        const upload = await new OutgoingMediaService({ workspaceRoot: root }).prepare({ path, type: 'document', caption: 'Fixture' });
        const snapshot = (upload.content as { document: { url: string } }).document.url;
        sendMessage.mockImplementationOnce(async (_jid, content, options) => {
            expect(await readFile(content.document.url, 'utf8')).toBe('%PDF-1.4\nNON-SENSITIVE TEST');
            return { key: { remoteJid: _jid, id: options.messageId, fromMe: true }, message: { documentMessage: { fileName: content.fileName, mimetype: content.mimetype } } };
        });
        const result = await service.sendContent({ recipientJid: jid, text: 'Fixture', content: upload.content, options: { maxRetries: 1 }, onSettled: () => upload.dispose() });
        expect(result.success).toBe(true);
        expect(service.findMessageKey(jid, result.messageId!, { fromMe: true })).toMatchObject({ remoteJid: jid, fromMe: true });
        expect(service.getSendOutcome(jid, result.messageId!)).toMatchObject({ success: true });
        await expect(access(snapshot)).rejects.toThrow();
        expect(await readFile(path, 'utf8')).toContain('NON-SENSITIVE TEST');
    });
    it('passes the original retained group key and message to native quote generation', async () => {
        const group = '120363012345@g.us';
        const key = { remoteJid: group, id: 'quoted', fromMe: false, participant: '15550000002@s.whatsapp.net' };
        await service.handleIncomingMessages({ type: 'notify', messages: [{ key, message: { conversation: 'Original 🚀' } }] });
        sendMessage.mockResolvedValueOnce({ key: { remoteJid: group, id: 'reply', fromMe: true }, participant: '15559999999@s.whatsapp.net', message: { conversation: 'Reply' } });
        const result = await service.sendContent({ recipientJid: group, text: 'Reply', quote: { messageId: key.id, conversationJid: group, fromMe: false, participant: key.participant } });
        expect(result.success).toBe(true);
        expect(sendMessage).toHaveBeenCalledWith(group, { text: 'Reply π' }, expect.objectContaining({ quoted: { key, message: { conversation: 'Original 🚀' } } }));
    });

    it('rejects missing and cross-chat quotes instead of silently sending unquoted', async () => {
        const quote = { messageId: 'missing', conversationJid: '15550000002@s.whatsapp.net' };
        const result = await service.sendContent({ recipientJid: jid, text: 'no fallback', quote });
        expect(result.success).toBe(false);
        expect(sendMessage).not.toHaveBeenCalled();
    });

    it('native quotes retain their observed LID target even if a configured send-number would redirect plain sends', async () => {
        const lid = '999999999@lid';
        const key = { remoteJid: lid, remoteJidAlt: jid, id: 'alias-quote', fromMe: false };
        await service.handleIncomingMessages({ type: 'notify', messages: [{ key, message: { conversation: 'Original via LID' } }] });
        vi.spyOn(service, 'resolveOutboundRecipientJid').mockReturnValue('15550000003@s.whatsapp.net');
        sendMessage.mockResolvedValueOnce({ key: { remoteJid: lid, id: 'alias-reply', fromMe: true }, message: { conversation: 'Reply' } });
        const result = await service.sendMessage(jid, 'Reply', false, { quote: { messageId: key.id, conversationJid: jid } });
        expect(result.success).toBe(true);
        expect(sendMessage).toHaveBeenCalledWith(lid, { text: 'Reply π' }, expect.objectContaining({ quoted: { key, message: { conversation: 'Original via LID' } } }));
    });

    it('reply UI reaches the actual socket with a native quote rather than just a local draft ID', async () => {
        const key = { remoteJid: jid, id: 'ui-target', fromMe: false };
        await service.handleIncomingMessages({ type: 'notify', messages: [{ key, message: { conversation: 'Selected' } }] });
        sendMessage.mockResolvedValueOnce({ key: { remoteJid: jid, id: 'ui-reply', fromMe: true }, message: { conversation: 'Native reply' } });
        const recordMessage = vi.fn();
        await showMessageReplyView({ ui: { editor: vi.fn().mockResolvedValue('Native reply'), notify: vi.fn(), setWidget: vi.fn() } }, {
            selectedMessage: { messageId: key.id, senderNumber: jid, text: 'Selected', direction: 'incoming', timestamp: Date.now() },
            whatsappService: service, recentsService: { recordMessage } as unknown as import('../../src/services/recents.service.ts').RecentsService
        });
        expect(sendMessage).toHaveBeenCalledWith(jid, { text: 'Native reply' }, expect.objectContaining({ quoted: { key, message: { conversation: 'Selected' } } }));
        expect(recordMessage).toHaveBeenCalledWith(expect.objectContaining({ quotedMessageId: key.id }));
    });

    it('refuses expired, deleted and direction-ambiguous targets without making a send', async () => {
        const key = { remoteJid: jid, id: 'duplicate', fromMe: false };
        await service.handleIncomingMessages({ type: 'notify', messages: [{ key, message: { conversation: 'Incoming' } }] });
        service.cacheSentMessage(key.id, { conversation: 'Outgoing' }, { ...key, fromMe: true });
        expect(service.getQuotedMessage(jid, { messageId: key.id })).toBeUndefined();
        expect(service.getQuotedMessage(jid, { messageId: key.id, fromMe: false })).toBeDefined();
        service.invalidateMessage(key);
        expect(service.getQuotedMessage(jid, { messageId: key.id, fromMe: false })).toBeUndefined();
        const now = Date.now();
        const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 24 * 60 * 60 * 1000 + 1);
        try {
            expect(service.getQuotedMessage(jid, { messageId: key.id, fromMe: true })).toBeUndefined();
        } finally { clock.mockRestore(); }
        expect(sendMessage).not.toHaveBeenCalled();
    });

    it('keeps its owned snapshot alive after caller abort until Baileys settles, then records the late acceptance', async () => {
        const path = join(root, 'notes.md');
        await writeFile(path, '# Non-sensitive fixture');
        const upload = await new OutgoingMediaService({ workspaceRoot: root }).prepare({ path, type: 'document' });
        const snapshot = (upload.content as { document: { url: string } }).document.url;
        const abort = new AbortController();
        let finish!: () => void;
        let started!: () => void;
        const began = new Promise<void>(resolve => { started = resolve; });
        sendMessage.mockImplementationOnce(async (_jid, _content, options) => {
            started();
            await new Promise<void>(resolve => { finish = resolve; });
            expect(await readFile(snapshot, 'utf8')).toContain('Non-sensitive');
            return { key: { id: options.messageId, remoteJid: _jid, fromMe: true }, message: { documentMessage: { fileName: 'notes.md' } } };
        });
        const settled = vi.fn(async () => { await upload.dispose(); });
        const pending = service.sendContent({ recipientJid: jid, text: '', content: upload.content, signal: abort.signal, onSettled: settled });
        await began;
        abort.abort();
        const result = await pending;
        expect(result).toMatchObject({ success: false, delivery: 'unknown' });
        expect(service.getSendOutcome(jid, result.messageId!)).toMatchObject({ delivery: 'unknown' });
        await expect(access(snapshot)).resolves.toBeUndefined();
        expect(settled).not.toHaveBeenCalled();
        finish();
        await vi.waitFor(() => expect(service.getSendOutcome(jid, result.messageId!)).toMatchObject({ success: true }));
        await vi.waitFor(async () => expect(await access(snapshot).then(() => true, () => false)).toBe(false));
        expect(sendMessage).toHaveBeenCalledOnce();
    });
});
