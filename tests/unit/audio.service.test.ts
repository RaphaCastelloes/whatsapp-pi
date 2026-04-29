import { beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';

const mocks = vi.hoisted(() => ({
    downloadContentFromMessage: vi.fn(),
    exec: vi.fn(),
    existsSync: vi.fn(),
    homedir: vi.fn(),
    mkdir: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn(),
    writeFile: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('@whiskeysockets/baileys', () => ({
    downloadContentFromMessage: mocks.downloadContentFromMessage
}));

vi.mock('node:child_process', () => ({
    exec: mocks.exec
}));

vi.mock('node:fs', () => ({
    existsSync: mocks.existsSync
}));

vi.mock('node:fs/promises', () => ({
    mkdir: mocks.mkdir,
    readFile: mocks.readFile,
    writeFile: mocks.writeFile
}));

vi.mock('node:os', () => ({
    homedir: mocks.homedir
}));

import { AudioService } from '../../src/services/audio.service.js';

const createStream = (...chunks: Buffer[]) => (async function* () {
    for (const chunk of chunks) {
        yield chunk;
    }
})();

const setupService = () => new AudioService();

describe('AudioService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(Date, 'now').mockReturnValue(1234567890);
        mocks.homedir.mockReturnValue('/home/test');
        mocks.exec.mockImplementation((_command: string, callback: (error?: Error | null, stdout?: string, stderr?: string) => void) => {
            callback(null, '', '');
            return undefined;
        });
        mocks.downloadContentFromMessage.mockResolvedValue(createStream(Buffer.from('media')));
        mocks.readFile.mockResolvedValue('transcribed text');
        mocks.existsSync.mockImplementation((target: string | Buffer | URL) => String(target).endsWith('.txt'));
    });

    it('creates media directory when it does not exist', () => {
        mocks.existsSync.mockReturnValue(false);

        setupService();

        expect(mocks.mkdir).toHaveBeenCalledWith(join('/home/test', '.pi', 'whatsapp-medias'), { recursive: true });
    });

    it('returns trimmed transcription text for a successful audio transcription', async () => {
        mocks.downloadContentFromMessage.mockResolvedValue(
            createStream(Buffer.from('part-1'), Buffer.from('part-2'))
        );
        mocks.readFile.mockResolvedValue('  áudio transcrito  \n');

        const service = setupService();
        const audioMessage = { id: 'audio-1' };

        await expect(service.transcribe(audioMessage as any)).resolves.toBe('áudio transcrito');

        const mediaDir = join('/home/test', '.pi', 'whatsapp-medias');
        const inputPath = join(mediaDir, 'audio_1234567890.ogg');
        const whisperPath = process.platform === 'win32'
            ? 'python -m whisper'
            : join('/home/test', '.local', 'bin', 'whisper');
        const command = `${whisperPath} "${inputPath}" --model small --language pt --output_format txt --output_dir "${mediaDir}" --fp16 False`;

        expect(mocks.downloadContentFromMessage).toHaveBeenCalledWith(audioMessage, 'audio');
        expect(mocks.writeFile).toHaveBeenCalledWith(inputPath, Buffer.concat([Buffer.from('part-1'), Buffer.from('part-2')]));
        expect(mocks.exec).toHaveBeenCalledWith(command, expect.any(Function));
        expect(mocks.readFile).toHaveBeenCalledWith(join(mediaDir, 'audio_1234567890.txt'), 'utf8');
    });

    it('uses the local whisper binary path on non-Windows platforms', async () => {
        const originalPlatform = process.platform;
        Object.defineProperty(process, 'platform', { value: 'linux' });

        try {
            const service = setupService();
            await service.transcribe({ id: 'audio-1' } as any);

            const mediaDir = join('/home/test', '.pi', 'whatsapp-medias');
            const inputPath = join(mediaDir, 'audio_1234567890.ogg');
            const command = `${join('/home/test', '.local', 'bin', 'whisper')} "${inputPath}" --model small --language pt --output_format txt --output_dir "${mediaDir}" --fp16 False`;

            expect(mocks.exec).toHaveBeenCalledWith(command, expect.any(Function));
        } finally {
            Object.defineProperty(process, 'platform', { value: originalPlatform });
        }
    });

    it('returns fallback when transcription output file is missing', async () => {
        mocks.existsSync.mockImplementation((target: string | Buffer | URL) => !String(target).endsWith('.txt'));

        const service = setupService();

        await expect(service.transcribe({ id: 'audio-2' } as any)).resolves.toBe('[Empty transcription]');
    });

    it('returns empty string when transcription output contains only whitespace', async () => {
        mocks.readFile.mockResolvedValue('  \n\t  ');

        const service = setupService();

        await expect(service.transcribe({ id: 'audio-3' } as any)).resolves.toBe('');
    });

    it('returns formatted error when audio download fails', async () => {
        mocks.downloadContentFromMessage.mockRejectedValue(new Error('download failed'));

        const service = setupService();

        await expect(service.transcribe({ id: 'audio-4' } as any)).resolves.toBe(
            '[Transcription error: download failed]'
        );

        expect(console.error).toHaveBeenCalledWith('[AudioService] Transcription error:', expect.any(Error));
    });

    it('returns formatted error when transcription execution fails', async () => {
        mocks.exec.mockImplementation((_command: string, callback: (error?: Error | null, stdout?: string, stderr?: string) => void) => {
            callback(new Error('whisper failed'));
            return undefined;
        });

        const service = setupService();

        await expect(service.transcribe({ id: 'audio-5' } as any)).resolves.toBe(
            '[Transcription error: whisper failed]'
        );

        expect(console.error).toHaveBeenCalledWith('[AudioService] Transcription error:', expect.any(Error));
    });
});
