import { describe, expect, it, vi } from 'vitest';
import { JidResolver } from '../../src/services/jid-resolver.service.ts';

const pn = '15550000001@s.whatsapp.net';
const lid = '999999999@lid';

describe('JidResolver', () => {
    it('does not manufacture a phone number from an unknown LID', () => {
        const resolver = new JidResolver();
        expect(resolver.senderNumber(lid)).toBe(lid);
        expect(resolver.senderNumber('15550000001:7@s.whatsapp.net')).toBe('+15550000001');
    });

    it('links alternate identities and preserves the original transport key', () => {
        const resolver = new JidResolver();
        const key = { remoteJid: lid, remoteJidAlt: pn, id: 'one', fromMe: false };
        resolver.observe(key);
        expect(resolver.senderNumber(lid)).toBe('+15550000001');
        expect(resolver.index('account', key)).toBe(resolver.index('account', { ...key, remoteJid: pn }));
        expect(key.remoteJid).toBe(lid);
    });

    it('notifies indexes of a late mapping and canonicalizes group participants', () => {
        const changed = vi.fn();
        const resolver = new JidResolver(changed);
        const key = { remoteJid: '120363000000@g.us', participant: lid, id: 'one', fromMe: false };
        const before = resolver.index('account', key);
        expect(resolver.bind(lid, pn)).toBe(true);
        expect(changed).toHaveBeenCalledOnce();
        expect(resolver.index('account', key)).not.toBe(before);
        expect(resolver.index('account', key)).toBe(resolver.index('account', { ...key, participant: pn }));
    });

    it('fails closed for conflicting mappings, including the earlier peer', () => {
        const resolver = new JidResolver();
        resolver.bind(lid, pn);
        expect(resolver.bind(lid, '15550000002@s.whatsapp.net')).toBe(false);
        expect(resolver.senderNumber(lid)).toBeUndefined();
        expect(resolver.senderNumber(pn)).toBeUndefined();
        expect(resolver.senderNumber('15550000002@s.whatsapp.net')).toBeUndefined();
    });

    it('keeps accounts, chats, directions and participants distinct and clears aliases', () => {
        const resolver = new JidResolver();
        const key = { remoteJid: pn, id: 'one', fromMe: false };
        expect(resolver.index('A', key)).not.toBe(resolver.index('B', key));
        expect(resolver.index('A', key)).not.toBe(resolver.index('A', { ...key, fromMe: true }));
        resolver.bind(lid, pn);
        resolver.clear();
        expect(resolver.senderNumber(lid)).toBe(lid);
    });
});
