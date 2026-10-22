import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateWAMessageFromContent, type proto } from 'baileys';
import { MessageStore } from '../../src/services/message-store.service.ts';
import { JidResolver } from '../../src/services/jid-resolver.service.ts';
const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => { for (const run of cleanup.splice(0).reverse()) await run(); });
const cases: Array<[string, proto.IMessage]> = [
    ['text', { conversation: 'text 😊\nline' }],
    ['image', { imageMessage: { caption: 'image', mimetype: 'image/png', url: 'SECRET_URL', mediaKey: new Uint8Array([1]) } }],
    ['document', { documentMessage: { caption: 'document', fileName: 'example.pdf', mimetype: 'application/pdf', directPath: 'SECRET_PATH' } }],
    ['audio', { audioMessage: { mimetype: 'audio/ogg', url: 'SECRET_URL' } }],
    ['video', { videoMessage: { caption: 'video', mimetype: 'video/mp4', url: 'SECRET_URL' } }]
];
describe('persisted native quote projections', () => {
    it.each(cases)('serializes a %s quote after restart without raw transport/media secrets', async (_kind, message) => {
        const root = await mkdtemp(join(tmpdir(), 'wa-native-archive-')); cleanup.push(() => rm(root, { recursive: true, force: true }));
        const options = { root: join(root, 'archive'), authProfile: 'auth', legacyPath: join(root, 'old.json') };
        const key = { remoteJid: '15550000001@s.whatsapp.net', id: 'original', fromMe: false };
        const store = new MessageStore(new JidResolver(), () => 'scope'); await store.initialize(options); await store.activate('self', 'scope');
        store.put({ key, message }); await store.flush(); await store.close();
        const restarted = new MessageStore(new JidResolver(), () => 'scope'); cleanup.push(() => restarted.close()); await restarted.initialize(options);
        const retained = restarted.find(key.remoteJid, key.id)!; expect(retained).toBeDefined(); expect(restarted.getForTransport(key)).toBeUndefined();
        const generated = generateWAMessageFromContent(key.remoteJid, { extendedTextMessage: { text: 'reply' } }, { userJid: '15559999999@s.whatsapp.net', quoted: { key: retained.key, message: retained.message } });
        expect(generated.message?.extendedTextMessage?.contextInfo?.stanzaId).toBe(key.id);
        expect(JSON.stringify(generated.message)).not.toMatch(/SECRET|mediaKey|directPath/);
    });
});
