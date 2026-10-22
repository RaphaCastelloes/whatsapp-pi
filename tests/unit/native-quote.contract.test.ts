import { describe, expect, it } from 'vitest';
import { generateWAMessageFromContent, type WAMessageKey } from 'baileys';
import { WhatsAppService } from '../../src/services/whatsapp.service.ts';
import type { SessionManager } from '../../src/services/session.manager.ts';

const self = '15559999999@s.whatsapp.net';
const direct = '15550000001@s.whatsapp.net';
const group = '120363012345@g.us';
const author = '999999999@lid';
const createService = () => {
    const service = new WhatsAppService({ getStatus: () => 'connected', isConversationAllowed: () => true } as unknown as SessionManager);
    Object.assign(service, { socket: { user: { id: self } } });
    return service;
};

describe('native Baileys quote serialization', () => {
    it.each([
        ['incoming direct', direct, false, undefined, direct],
        ['own direct', direct, true, undefined, self],
        ['incoming LID group author', group, false, author, author],
        ['own PN group author', group, true, self, self]
    ] as const)('serializes %s with the observed stanza and correct participant', async (_name, jid, fromMe, participant, expected) => {
        const service = createService();
        const key: WAMessageKey = { remoteJid: jid, id: 'original', fromMe, ...(participant ? { participant } : {}) };
        const message = { conversation: 'Original fixture' };
        if (fromMe) service.cacheSentMessage(key.id, message, key);
        else await service.handleIncomingMessages({ type: 'notify', messages: [{ key, message }] });
        const quoted = service.getQuotedMessage(jid, { messageId: 'original', fromMe, participant });
        expect(quoted).toBeDefined();
        const generated = generateWAMessageFromContent(jid, { extendedTextMessage: { text: 'Native reply' } }, { userJid: self, quoted });
        expect(generated.message?.extendedTextMessage?.contextInfo).toMatchObject({ stanzaId: key.id, participant: expected, quotedMessage: { conversation: 'Original fixture' } });
    });
    it('rejects the installed dependency’s unsupported own-LID group quote rather than silently rewriting its author', () => {
        const service = createService();
        const key = { remoteJid: group, id: 'own-lid', fromMe: true, participant: author };
        const message = { conversation: 'Own LID fixture' };
        const native = generateWAMessageFromContent(group, { extendedTextMessage: { text: 'Reply' } }, { userJid: self, quoted: { key, message } });
        expect(native.message?.extendedTextMessage?.contextInfo?.participant).toBe(self);
        expect(native.message?.extendedTextMessage?.contextInfo?.participant).not.toBe(author);
        service.cacheSentMessage(key.id, message, key);
        expect(service.getQuotedMessage(group, { messageId: key.id, fromMe: true, participant: author })).toBeUndefined();
    });
});
