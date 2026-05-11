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
});
