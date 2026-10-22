import { describe, expect, it, vi } from 'vitest';
import { JidResolver } from '../../src/services/jid-resolver.service.ts';
import { MessageStore } from '../../src/services/message-store.service.ts';

const key = { remoteJid: '15550000001@s.whatsapp.net', id: 'same', fromMe: false };

describe('MessageStore', () => {
    it('scopes duplicate IDs and requires an unambiguous complete target', () => {
        const store = new MessageStore(new JidResolver(), () => 'account');
        store.put({ key, message: { conversation: 'incoming' } });
        store.put({ key: { ...key, fromMe: true }, message: { conversation: 'outgoing' } });
        expect(store.get(key)?.message).toEqual({ conversation: 'incoming' });
        expect(store.find(key.remoteJid, key.id)).toBeUndefined();
        expect(store.get({ ...key, remoteJid: '15550000002@s.whatsapp.net' })).toBeUndefined();
    });

    it('does not expose another account or a changed transport key', () => {
        let account = 'A';
        const store = new MessageStore(new JidResolver(), () => account);
        store.put({ key, message: { conversation: 'private' } });
        account = 'B';
        expect(store.get(key)).toBeUndefined();
    });

    it('re-indexes a verified late mapping without changing the original key', () => {
        const resolver = new JidResolver();
        const store = new MessageStore(resolver, () => 'account');
        store.put({ key: { ...key, remoteJid: '999999999@lid' }, message: { conversation: 'original' } });
        resolver.bind('999999999@lid', key.remoteJid);
        store.reindex();
        expect(store.get(key)?.key.remoteJid).toBe('999999999@lid');
    });

    it('evicts by count and expires raw data and owned IDs', () => {
        const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
        try {
            const store = new MessageStore(new JidResolver(), () => 'account', 2, 100);
            for (const id of ['one', 'two', 'three']) store.put({ key: { ...key, id }, message: { conversation: id } });
            expect(store.get({ ...key, id: 'one' })).toBeUndefined();
            store.own({ ...key, fromMe: true });
            expect(store.isOwn({ ...key, fromMe: true })).toBe(true);
            clock.mockReturnValue(1100);
            expect(store.get({ ...key, id: 'three' })).toBeUndefined();
            expect(store.isOwn({ ...key, fromMe: true })).toBe(false);
        } finally {
            clock.mockRestore();
        }
    });

    it('excludes view-once content and obeys earlier disappearing expiry', () => {
        const clock = vi.spyOn(Date, 'now').mockReturnValue(10_000);
        try {
            const store = new MessageStore(new JidResolver(), () => 'account');
            store.put({ key, message: { viewOnceMessage: { message: { imageMessage: { caption: 'private' } } } } });
            expect(store.get(key)).toBeUndefined();
            store.put({ key, messageTimestamp: 1, message: { extendedTextMessage: { text: 'expired', contextInfo: { expiration: 1 } } } });
            expect(store.get(key)).toBeUndefined();
        } finally {
            clock.mockRestore();
        }
    });

    it('protects an own-send echo before a response exists, but not another sender direction', () => {
        const store = new MessageStore(new JidResolver(), () => 'account');
        store.own({ ...key, fromMe: true });
        expect(store.isOwn({ ...key, fromMe: true, participant: 'self@s.whatsapp.net' })).toBe(true);
        expect(store.isOwn(key)).toBe(false);
        store.clear();
        expect(store.isOwn({ ...key, fromMe: true })).toBe(false);
    });
});
