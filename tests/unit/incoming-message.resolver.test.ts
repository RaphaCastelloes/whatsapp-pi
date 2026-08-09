import { beforeEach, describe, expect, it } from 'vitest';
import { resetI18n } from '../../src/i18n.ts';
import { extractIncomingText } from '../../src/services/incoming-message.resolver.ts';

describe('extractIncomingText', () => {
    beforeEach(() => {
        resetI18n();
    });

    it('extracts plain conversation text', () => {
        expect(extractIncomingText({ conversation: 'hello' })).toEqual({
            kind: 'text',
            text: 'hello'
        });
    });

    it('extracts extended text messages', () => {
        expect(extractIncomingText({ extendedTextMessage: { text: 'extended hello' } })).toEqual({
            kind: 'text',
            text: 'extended hello'
        });
    });

    it('resolves video messages with captions', () => {
        const videoMessage = { caption: 'watch this', mimetype: 'video/mp4' };

        expect(extractIncomingText({ videoMessage })).toEqual({
            kind: 'video',
            text: 'watch this',
            videoMessage
        });
    });

    it('resolves image messages with captions', () => {
        const imageMessage = { caption: 'look', mimetype: 'image/jpeg' };

        expect(extractIncomingText({ imageMessage })).toEqual({
            kind: 'image',
            text: 'look',
            imageMessage
        });
    });

    it('unwraps ephemeral message content', () => {
        expect(extractIncomingText({
            ephemeralMessage: {
                message: {
                    conversation: 'hidden'
                }
            }
        })).toEqual({
            kind: 'text',
            text: 'hidden'
        });
    });

    it('formats protocol messages as system messages', () => {
        expect(extractIncomingText({ protocolMessage: { type: 0 } })).toEqual({
            kind: 'system',
            text: '[Message Deleted]'
        });
    });

    it('extracts reaction messages with emoji', () => {
        const reactionMessage = { text: '👍', key: { remoteJid: '123@s.whatsapp.net', id: 'msg123', fromMe: false } };
        expect(extractIncomingText({ reactionMessage })).toEqual({
            kind: 'reaction',
            text: '👍 Reacted to message',
            reactionMessage
        });
    });

    it('handles removed reactions', () => {
        const reactionMessage = { text: '', key: { remoteJid: '123@s.whatsapp.net', id: 'msg123', fromMe: false } };
        expect(extractIncomingText({ reactionMessage })).toEqual({
            kind: 'reaction',
            text: 'Removed reaction',
            reactionMessage
        });
    });
});
