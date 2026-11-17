import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { access, copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { OutgoingMediaService } from '../../src/services/outgoing-media.service.ts';
import { getFfmpegCommands } from '../../src/services/ffmpeg-path.ts';

const mocks = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', async importOriginal => {
    const original = await importOriginal<typeof import('node:child_process')>();
    mocks.spawn.mockImplementation(original.spawn);
    return { ...original, spawn: mocks.spawn };
});
beforeEach(async () => {
    const original = await vi.importActual<typeof import('node:child_process')>('node:child_process');
    mocks.spawn.mockReset().mockImplementation(original.spawn);
});
const run = promisify(execFile);
const ffmpeg = getFfmpegCommands().find(command => spawnSync(command, ['-version'], { stdio: 'ignore' }).status === 0);

// Real codecs exercise preparation, not WhatsApp; unavailable executables are reported as skips.
describe.skipIf(!ffmpeg)('OutgoingMediaService real FFmpeg codecs', () => {
    let root: string;
    const prepared: Array<{ dispose(): Promise<void> }> = [];
    beforeAll(async () => {
        root = await mkdtemp(join(tmpdir(), 'wa-convert-test-'));
        await run(ffmpeg!, ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.2', '-c:a', 'pcm_s16le', join(root, 'tone.wav')]);
        await run(ffmpeg!, ['-v', 'error', '-i', join(root, 'tone.wav'), '-c:a', 'libmp3lame', join(root, 'tone.mp3')]);
        await run(ffmpeg!, ['-v', 'error', '-i', join(root, 'tone.wav'), '-c:a', 'libopus', join(root, 'tone.ogg')]);
        await run(ffmpeg!, ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=64x64:d=0.2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', join(root, 'clip.mp4')]);
        await run(ffmpeg!, ['-v', 'error', '-i', join(root, 'clip.mp4'), '-c:v', 'mpeg4', join(root, 'clip.avi')]);
    }, 20_000);
    afterEach(async () => { await Promise.all(prepared.splice(0).map(item => item.dispose())); });
    afterAll(async () => { if (root) await rm(root, { recursive: true, force: true }); });
    const prepare = async (name: string, type: 'audio' | 'video', voiceNote = false) => {
        const result = await new OutgoingMediaService({ workspaceRoot: root, ffmpegCommands: [ffmpeg!] }).prepare({ path: join(root, name), type, voiceNote });
        prepared.push(result);
        return result;
    };
    it('sends compatible MP3 audio without an unnecessary conversion', async () => {
        const result = await prepare('tone.mp3', 'audio');
        expect(result.metadata).toMatchObject({ type: 'audio', mimetype: 'audio/mpeg', converted: false });
        expect(result.content).toMatchObject({ audio: { url: expect.any(String) }, ptt: false });
    });
    it('sends Ogg/Opus voice notes with the native PTT flag', async () => {
        const result = await prepare('tone.ogg', 'audio', true);
        expect(result.metadata.converted).toBe(false);
        expect(result.content).toMatchObject({ audio: { url: expect.any(String) }, ptt: true, mimetype: 'audio/ogg; codecs=opus' });
    });
    it('converts WAV to Opus for voice notes and AAC for ordinary audio', async () => {
        const voice = await prepare('tone.wav', 'audio', true);
        const audio = await prepare('tone.wav', 'audio');
        expect(voice.metadata).toMatchObject({ converted: true, mimetype: 'audio/ogg; codecs=opus' });
        expect(audio.metadata).toMatchObject({ converted: true, mimetype: 'audio/mp4' });
        const path = (voice.content as { audio: { url: string } }).audio.url;
        expect((await readFile(path)).subarray(0, 4).toString()).toBe('OggS');
    });
    it('bypasses compatible MP4 and converts AVI to H.264 MP4', async () => {
        const direct = await prepare('clip.mp4', 'video');
        const converted = await prepare('clip.avi', 'video');
        expect(direct.metadata).toMatchObject({ mimetype: 'video/mp4', converted: false });
        expect(converted.metadata).toMatchObject({ mimetype: 'video/mp4', converted: true });
    });
    it('handles metacharacters as a filename, never as a shell command', async () => {
        const name = 'tone $(touch NEVER-CREATED).wav';
        await copyFile(join(root, 'tone.wav'), join(root, name));
        const result = await prepare(name, 'audio', true);
        expect(result.metadata.converted).toBe(true);
        await expect(access(join(root, 'NEVER-CREATED'))).rejects.toThrow();
    });
});

describe('FFmpeg process and temporary ownership', () => {
    let root: string;
    afterEach(async () => { vi.restoreAllMocks(); if (root) await rm(root, { recursive: true, force: true }); });
    const createInput = async () => {
        root = await mkdtemp(join(tmpdir(), 'wa-process-test-'));
        const file = join(root, 'fixture.wav');
        await writeFile(file, Buffer.from('RIFF1234WAVEfixture'));
        return file;
    };
    it.each(['abort', 'timeout', 'abort-thumbnail', 'timeout-thumbnail'])('waits for child exit before deleting snapshots on %s', async mode => {
        const path = await createInput();
        const thumbnail = mode.includes('thumbnail');
        if (thumbnail) await writeFile(path, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]));
        const child = Object.assign(new EventEmitter(), { stderr: new PassThrough(), kill: vi.fn().mockReturnValue(true) });
        let started!: () => void;
        const began = new Promise<void>(resolve => { started = resolve; });
        let snapshot = '';
        mocks.spawn.mockImplementationOnce((_command, args) => { snapshot = args[args.indexOf('-i') + 1]; started(); return child; });
        const abort = new AbortController();
        const service = new OutgoingMediaService({ workspaceRoot: root, ffmpegCommands: ['fixture-ffmpeg'], conversionTimeoutMs: mode.startsWith('timeout') ? 20 : 60_000 });
        const pending = service.prepare({ path, type: thumbnail ? 'image' : 'audio', voiceNote: !thumbnail }, abort.signal);
        let settled = false;
        void pending.then(() => { settled = true; }, () => { settled = true; });
        await began;
        if (mode.startsWith('abort')) abort.abort();
        await vi.waitFor(() => expect(child.kill).toHaveBeenCalled());
        expect(settled).toBe(false);
        await expect(access(snapshot)).resolves.toBeUndefined();
        child.emit('close', null, 'SIGTERM');
        await expect(pending).rejects.toThrow();
        await expect(access(snapshot)).rejects.toThrow();
        await expect(access(path)).resolves.toBeUndefined();
    });
    it.each(['failed', 'oversize'])('cleans owned conversion files on %s output without deleting the user original', async mode => {
        const path = await createInput();
        mocks.spawn.mockImplementationOnce(() => {
            const child = Object.assign(new EventEmitter(), { stderr: new PassThrough(), kill: vi.fn() });
            queueMicrotask(() => { child.stderr.write('Input #0, wav, from fixture:\n  Duration: 00:00:01.00\n  Stream #0:0: Audio: pcm_s16le\nAt least one output file must be specified'); child.emit('close', 1); });
            return child;
        });
        let output = '';
        mocks.spawn.mockImplementationOnce((_command, args) => {
            output = args.at(-1);
            const child = Object.assign(new EventEmitter(), { stderr: new PassThrough(), kill: vi.fn() });
            if (mode === 'failed') queueMicrotask(() => child.emit('close', 1));
            else void writeFile(output, Buffer.alloc(2_000)).then(() => child.emit('close', 0));
            return child;
        });
        const service = new OutgoingMediaService({ workspaceRoot: root, maxBytes: 1_000, ffmpegCommands: ['fixture-ffmpeg'] });
        await expect(service.prepare({ path, type: 'audio', voiceNote: true })).rejects.toThrow();
        await expect(access(output)).rejects.toThrow();
        await expect(access(path)).resolves.toBeUndefined();
    });

    it('reports missing FFmpeg without installing anything or removing the user input', async () => {
        const path = await createInput();
        const service = new OutgoingMediaService({ workspaceRoot: root, ffmpegCommands: [join(root, 'missing-ffmpeg')] });
        await expect(service.prepare({ path, type: 'audio' })).rejects.toThrow(/FFmpeg/i);
        await expect(access(path)).resolves.toBeUndefined();
    });
    it('rejects playlists and voice-note mode on non-audio inputs', async () => {
        const path = await createInput();
        await writeFile(path, '#EXTM3U\nhttps://example.com/remote');
        const service = new OutgoingMediaService({ workspaceRoot: root });
        await expect(service.prepare({ path, type: 'audio' })).rejects.toThrow();
        await expect(service.prepare({ path, type: 'document', voiceNote: true })).rejects.toThrow();
    });
});
