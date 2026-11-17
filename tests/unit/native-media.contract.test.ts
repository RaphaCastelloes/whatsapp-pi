import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OutgoingMediaService, type OutgoingMediaType } from '../../src/services/outgoing-media.service.ts';
import { getFfmpegCommands } from '../../src/services/ffmpeg-path.ts';

const run = promisify(execFile);
const ffmpeg = getFfmpegCommands().find(command => spawnSync(command, ['-version'], { stdio: 'ignore' }).status === 0);
const nativeConsumer = `
import fs from 'node:fs';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
process.umask(0o022);
const originals = [];
let extraExecs = 0;
const createWriteStream = fs.createWriteStream;
fs.createWriteStream = function(path, options) {
  if (String(path).endsWith('-original')) originals.push(String(path));
  return createWriteStream.call(this, path, options);
};
childProcess.exec = function(_command, callback) {
  extraExecs++;
  callback(new Error('Unowned subprocess blocked by native-contract test'));
};
syncBuiltinESMExports();
const { prepareWAMessageMedia } = await import('baileys');
const content = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'), (_key, value) => value && typeof value.fixtureBytes === 'string' ? Buffer.from(value.fixtureBytes, 'base64') : value);
let plaintextModes = [];
const result = await prepareWAMessageMedia(content, { upload: async () => {
  await new Promise(resolve => setImmediate(resolve));
  plaintextModes = originals.map(path => fs.statSync(path).mode & 0o777);
  return { mediaUrl: 'https://example.invalid/fixture', directPath: '/fixture' };
}});
const message = result.imageMessage ?? result.audioMessage ?? result.videoMessage;
console.log(JSON.stringify({ originalCopies: originals.length, plaintextModes, extraExecs, native: Boolean(message), seconds: message?.seconds, thumbnail: Boolean(message?.jpegThumbnail?.length), ptt: message?.ptt }));
`;

describe.skipIf(!ffmpeg)('real Baileys native media consumer under umask 022', () => {
    let root: string;
    beforeAll(async () => {
        root = await mkdtemp(join(tmpdir(), 'wa-native-contract-'));
        await run(ffmpeg!, ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=32x32', '-frames:v', '1', join(root, 'image.png')]);
        await run(ffmpeg!, ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.2', '-c:a', 'libmp3lame', join(root, 'audio.mp3')]);
        await run(ffmpeg!, ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.2', '-c:a', 'libopus', join(root, 'voice.ogg')]);
        await run(ffmpeg!, ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=64x64:d=0.2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', join(root, 'video.mp4')]);
    }, 20_000);
    afterAll(async () => { if (root) await rm(root, { recursive: true, force: true }); });
    it.each([
        ['image.png', 'image', false], ['audio.mp3', 'audio', false], ['voice.ogg', 'audio', true], ['video.mp4', 'video', false]
    ] as const)('does not recreate plaintext or start unowned processing for %s', async (file, type: OutgoingMediaType, voiceNote) => {
        const prepared = await new OutgoingMediaService({ workspaceRoot: root, ffmpegCommands: [ffmpeg!] }).prepare({ path: join(root, file), type, voiceNote });
        try {
            const payload = join(root, `${file}.json`);
            await writeFile(payload, JSON.stringify(prepared.content, (_key, value) => value instanceof Uint8Array ? { fixtureBytes: Buffer.from(value).toString('base64') } : value), { mode: 0o600 });
            const { stdout } = await run(process.execPath, ['--input-type=module', '-e', nativeConsumer, payload], { cwd: process.cwd(), timeout: 30_000, maxBuffer: 1024 * 1024 });
            const result = JSON.parse(stdout.trim());
            expect(result).toMatchObject({ native: true, originalCopies: 0, plaintextModes: [], extraExecs: 0 });
            if (type === 'audio') expect(result.seconds).toBeGreaterThan(0);
            else expect(result.thumbnail).toBe(true);
            if (voiceNote) expect(result.ptt).toBe(true);
        } finally { await prepared.dispose(); }
    }, 35_000);
});
