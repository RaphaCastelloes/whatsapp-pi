import { beforeEach, describe, expect, it, vi } from 'vitest';
import { showMessageReplyView } from '../../src/ui/message-reply.view.js';

const createContext = (edits: Array<string | undefined>) => {
    const queue = [...edits];

    return {
        ui: {
            editor: vi.fn(async () => queue.shift()),
            notify: vi.fn(),
            setWidget: vi.fn()
        }
    };
};

describe('showMessageReplyView', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(Date, 'now').mockReturnValue(1234567890);
    });

    it('sends the reply to the selected conversation and records it', async () => {
        const ctx = createContext(['Obrigada!']);
        const whatsappService = {
            sendMenuMessage: vi.fn().mockResolvedValue({ success: true, messageId: 'MSG-REPLY' })
        };
        const recentsService = {
            recordMessage: vi.fn().mockResolvedValue(undefined)
        };

        await showMessageReplyView(ctx as any, {
            selectedMessage: {
                messageId: 'MSG-1',
                senderNumber: '+5511999998888',
                senderName: 'Ana',
                text: 'Original message',
                direction: 'incoming',
                timestamp: 1111
            },
            whatsappService: whatsappService as any,
            recentsService: recentsService as any
        });

        expect(ctx.ui.setWidget).toHaveBeenCalledWith('message-reply-context', expect.any(Array), { placement: 'belowEditor' });
        expect(ctx.ui.editor).toHaveBeenCalledWith('Reply to Ana (+5511999998888)');
        expect(whatsappService.sendMenuMessage).toHaveBeenCalledWith('+5511999998888', 'Obrigada!');
        expect(recentsService.recordMessage).toHaveBeenCalledWith({
            messageId: 'MSG-REPLY',
            senderNumber: '+5511999998888',
            senderName: 'Ana',
            text: 'Obrigada!',
            direction: 'outgoing',
            timestamp: 1234567890
        });
        expect(ctx.ui.notify).toHaveBeenCalledWith('Sent reply to Original message', 'info');
        expect(ctx.ui.setWidget).toHaveBeenCalledWith('message-reply-context', undefined);
    });

    it('rejects empty reply submissions and keeps the composer open', async () => {
        const ctx = createContext(['   ', 'Tudo certo']);
        const whatsappService = {
            sendMenuMessage: vi.fn().mockResolvedValue({ success: true, messageId: 'MSG-REPLY' })
        };
        const recentsService = {
            recordMessage: vi.fn().mockResolvedValue(undefined)
        };

        await showMessageReplyView(ctx as any, {
            selectedMessage: {
                messageId: 'MSG-1',
                senderNumber: '+5511999998888',
                senderName: 'Ana',
                text: 'Original message',
                direction: 'incoming',
                timestamp: 1111
            },
            whatsappService: whatsappService as any,
            recentsService: recentsService as any
        });

        expect(ctx.ui.notify).toHaveBeenCalledWith('Please enter a message before sending.', 'error');
        expect(whatsappService.sendMenuMessage).toHaveBeenCalledWith('+5511999998888', 'Tudo certo');
        expect(recentsService.recordMessage).toHaveBeenCalledOnce();
    });

    it('returns to the detail view when the user cancels', async () => {
        const ctx = createContext([undefined]);
        const whatsappService = {
            sendMenuMessage: vi.fn()
        };
        const recentsService = {
            recordMessage: vi.fn()
        };

        await showMessageReplyView(ctx as any, {
            selectedMessage: {
                messageId: 'MSG-1',
                senderNumber: '+5511999998888',
                senderName: 'Ana',
                text: 'Original message',
                direction: 'incoming',
                timestamp: 1111
            },
            whatsappService: whatsappService as any,
            recentsService: recentsService as any
        });

        expect(whatsappService.sendMenuMessage).not.toHaveBeenCalled();
        expect(recentsService.recordMessage).not.toHaveBeenCalled();
        expect(ctx.ui.setWidget).toHaveBeenCalledWith('message-reply-context', undefined);
    });
});
