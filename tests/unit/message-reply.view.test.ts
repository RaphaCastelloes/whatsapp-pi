import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetI18n } from '../../src/i18n.ts';
import { showMessageReplyView } from '../../src/ui/message-reply.view.ts';
import type { WhatsAppService } from '../../src/services/whatsapp.service.ts';
import type { RecentsService } from '../../src/services/recents.service.ts';
import type { SelectedMessageContext } from '../../src/models/whatsapp.types.ts';

const selected: SelectedMessageContext = { messageId: 'MSG-1', senderNumber: '+5511999998888', senderName: 'Ana', text: 'Original message', direction: 'incoming', timestamp: 1111 };
const setup = (edits: Array<string | undefined>, message = selected) => {
    const queue = [...edits];
    const ctx = { ui: { editor: vi.fn(async () => queue.shift()), notify: vi.fn(), setWidget: vi.fn() } };
    const service = {
        getSessionContext: vi.fn().mockReturnValue({ accountScope: 'account', generation: 1 }),
        isSessionContextCurrent: vi.fn().mockReturnValue(true),
        getQuotedMessage: vi.fn().mockReturnValue({ key: { remoteJid: message.senderNumber.includes('@') ? message.senderNumber : message.senderNumber.slice(1) + '@s.whatsapp.net', id: message.messageId, fromMe: false }, message: { conversation: message.text } }),
        resolveOutboundRecipientJid: vi.fn().mockReturnValue('WRONG-OVERRIDE@s.whatsapp.net'),
        sendMenuMessage: vi.fn().mockResolvedValue({ success: true, messageId: 'MSG-REPLY' })
    };
    const recents = { recordMessage: vi.fn().mockResolvedValue(undefined) };
    const run = () => showMessageReplyView(ctx, { selectedMessage: message, whatsappService: service as unknown as WhatsAppService, recentsService: recents as unknown as RecentsService });
    return { ctx, service, recents, run };
};

describe('showMessageReplyView native quotes', () => {
    beforeEach(() => {
        resetI18n();
        vi.clearAllMocks();
        vi.spyOn(Date, 'now').mockReturnValue(1234567890);
    });
    it('quotes the selected message in its original chat and records the relationship once', async () => {
        const { ctx, service, recents, run } = setup(['Obrigada!']);
        await run();
        expect(service.sendMenuMessage).toHaveBeenCalledWith('5511999998888@s.whatsapp.net', 'Obrigada!', { messageId: 'MSG-1', conversationJid: '+5511999998888', fromMe: false });
        expect(recents.recordMessage).toHaveBeenCalledWith({ messageId: 'MSG-REPLY', quotedMessageId: 'MSG-1', senderNumber: '+5511999998888', senderName: 'Ana', text: 'Obrigada!', direction: 'outgoing', timestamp: 1234567890 });
        expect(ctx.ui.notify).toHaveBeenCalledWith('Sent reply to Original message', 'info');
        expect(ctx.ui.setWidget).toHaveBeenLastCalledWith('message-reply-context', undefined);
    });
    it('rejects an empty reply and keeps the composer open', async () => {
        const { ctx, service, run } = setup(['   ', 'Valid']);
        await run();
        expect(ctx.ui.notify).toHaveBeenCalledWith('Please enter a message before sending.', 'error');
        expect(service.sendMenuMessage).toHaveBeenCalledOnce();
        expect(ctx.ui.editor).toHaveBeenCalledTimes(2);
    });
    it('cancellation sends and records nothing', async () => {
        const { ctx, service, recents, run } = setup([undefined]);
        await run();
        expect(service.sendMenuMessage).not.toHaveBeenCalled();
        expect(recents.recordMessage).not.toHaveBeenCalled();
        expect(ctx.ui.setWidget).toHaveBeenLastCalledWith('message-reply-context', undefined);
    });
    it('preserves the quoted LID transport instead of applying a send-number override', async () => {
        const { service, recents, run } = setup(['LID reply'], { ...selected, senderNumber: '123456789@lid' });
        await run();
        expect(service.resolveOutboundRecipientJid).not.toHaveBeenCalled();
        expect(service.sendMenuMessage).toHaveBeenCalledWith('123456789@lid', 'LID reply', expect.objectContaining({ conversationJid: '123456789@lid' }));
        expect(recents.recordMessage).toHaveBeenCalledWith(expect.objectContaining({ senderNumber: '123456789@lid' }));
    });
    it('shows quote unavailability for an evicted or legacy target instead of opening an unquoted composer', async () => {
        const { ctx, service, run } = setup(['Do not send']);
        service.getQuotedMessage.mockReturnValue(undefined);
        await run();
        expect(ctx.ui.editor).not.toHaveBeenCalled();
        expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining('Native quote unavailable'), 'error');
        expect(service.sendMenuMessage).not.toHaveBeenCalled();
    });
    it('does not send an old composer through a replacement account', async () => {
        const { ctx, service, run } = setup(['Stale']);
        service.isSessionContextCurrent.mockReturnValue(false);
        await run();
        expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining('account or session changed'), 'error');
        expect(service.sendMenuMessage).not.toHaveBeenCalled();
    });
});
