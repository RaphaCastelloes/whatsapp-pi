import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetI18n } from '../../src/i18n.ts';
import { ReactionSender } from '../../src/services/reaction.sender.ts';

describe('ReactionSender', () => {
    beforeEach(() => {
        resetI18n();
    });

    it('sends reaction successfully', async () => {
        const mockSocket = {
            sendMessage: vi.fn().mockResolvedValue({ key: { id: 'reaction123' } })
        };
        const sender = new ReactionSender(mockSocket as any);

        const result = await sender.sendReaction({
            jid: '123@s.whatsapp.net',
            messageId: 'msg123',
            emoji: '👍'
        });

        expect(result.success).toBe(true);
        expect(result.messageId).toBe('reaction123');
        expect(mockSocket.sendMessage).toHaveBeenCalledWith(
            '123@s.whatsapp.net',
            {
                react: {
                    text: '👍',
                    key: {
                        remoteJid: '123@s.whatsapp.net',
                        id: 'msg123',
                        fromMe: false
                    }
                }
            }
        );
    });

    it('rejects invalid emoji', async () => {
        const sender = new ReactionSender({} as any);

        const result = await sender.sendReaction({
            jid: '123@s.whatsapp.net',
            messageId: 'msg123',
            emoji: 'invalid'
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid emoji');
    });

    it('returns error when not connected', async () => {
        const sender = new ReactionSender(null);

        const result = await sender.sendReaction({
            jid: '123@s.whatsapp.net',
            messageId: 'msg123',
            emoji: '👍'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('not connected');
    });

    it('handles socket sendMessage error', async () => {
        const mockSocket = {
            sendMessage: vi.fn().mockRejectedValue(new Error('Network error'))
        };
        const sender = new ReactionSender(mockSocket as any);

        const result = await sender.sendReaction({
            jid: '123@s.whatsapp.net',
            messageId: 'msg123',
            emoji: '❤️'
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Network error');
    });

    it('accepts empty string emoji to remove reaction', async () => {
        const mockSocket = {
            sendMessage: vi.fn().mockResolvedValue({ key: { id: 'reaction456' } })
        };
        const sender = new ReactionSender(mockSocket as any);

        const result = await sender.sendReaction({
            jid: '123@s.whatsapp.net',
            messageId: 'msg123',
            emoji: ''
        });

        expect(result.success).toBe(true);
        expect(mockSocket.sendMessage).toHaveBeenCalledWith(
            '123@s.whatsapp.net',
            {
                react: {
                    text: '',
                    key: {
                        remoteJid: '123@s.whatsapp.net',
                        id: 'msg123',
                        fromMe: false
                    }
                }
            }
        );
    });

    it('preserves a full group target key, including own direction and participant', async () => {
        const socket = { sendMessage: vi.fn().mockResolvedValue({ key: { id: 'sent' } }) };
        const key = { remoteJid: '120363000000@g.us', id: 'original', fromMe: true, participant: 'self@lid', participantAlt: '15550000001@s.whatsapp.net' };
        const sender = new ReactionSender(socket, () => key);
        expect((await sender.sendReaction({ jid: key.remoteJid, messageId: key.id, emoji: '👍🏽' })).success).toBe(true);
        expect(socket.sendMessage).toHaveBeenCalledWith(key.remoteJid, { react: { text: '👍🏽', key } });
    });

    it('does not guess unavailable or ambiguous targets', async () => {
        const socket = { sendMessage: vi.fn() };
        const sender = new ReactionSender(socket, () => undefined);
        expect((await sender.sendReaction({ jid: '120363000000@g.us', messageId: 'missing', emoji: '👍' })).success).toBe(false);
        expect(socket.sendMessage).not.toHaveBeenCalled();
    });

    it('rejects multiple emoji graphemes', async () => {
        const socket = { sendMessage: vi.fn() };
        const sender = new ReactionSender(socket);
        expect((await sender.sendReaction({ jid: '123@s.whatsapp.net', messageId: 'id', emoji: '👍👍' })).success).toBe(false);
        expect(socket.sendMessage).not.toHaveBeenCalled();
    });

    it('validates various standard emojis', async () => {
        const mockSocket = {
            sendMessage: vi.fn().mockResolvedValue({ key: { id: 'reaction' } })
        };
        const sender = new ReactionSender(mockSocket as any);

        const validEmojis = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '👏', '👨‍👩‍👧‍👦', '👍🏽', '🇦🇷', '1️⃣'];

        for (const emoji of validEmojis) {
            const result = await sender.sendReaction({
                jid: '123@s.whatsapp.net',
                messageId: 'msg123',
                emoji
            });
            expect(result.success).toBe(true);
        }
    });
});
