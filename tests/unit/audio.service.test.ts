import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetI18n } from '../../src/i18n.ts';
import { join } from 'node:path';

const mocks = vi.hoisted(() => ({
    downloadContentFromMessage: vi.fn(),
    existsSync: vi.fn(),
    execFile: vi.fn(),
    homedir: vi.fn(),
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('baileys', () => ({
    downloadContentFromMessage: mocks.downloadContentFromMessage
}));

vi.mock('node:child_process', () => ({
    execFile: mocks.execFile
}));

vi.mock('node:fs', () => ({
    existsSync: mocks.existsSync
}));

vi.mock('node:os', () => ({
    homedir: mocks.homedir
}));

vi.mock('node:fs/promises', () => ({
    mkdir: mocks.mkdir,
    writeFile: mocks.writeFile
}));

const createStream = (...chunks: Buffer[]) => (async function* () {
    for (const chunk of chunks) {
        yield chunk;
    }
})();

const logger = {
    log: vi.fn(),
    error: vi.fn()
};

const whisperTranscriber = {
    transcribe: vi.fn()
};

let AudioService: typeof import('../../src/services/audio.service.ts').AudioService;

const setupService = () => new AudioService(logger as any, whisperTranscriber as any);

describe('AudioService', () => {
    beforeEach(async () => {
        resetI18n();
        vi.clearAllMocks();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        logger.log.mockClear();
        logger.error.mockClear();
        vi.spyOn(Date, 'now').mockReturnValue(1234567890);
        mocks.homedir.mockReturnValue('/home/test');
        mocks.downloadContentFromMessage.mockResolvedValue(createStream(Buffer.from('media')));
        mocks.existsSync.mockReturnValue(true);
        mocks.execFile.mockImplementation((...args: unknown[]) => {
            const callback = args.at(-1) as (error?: Error | null) => void;
            callback(null);
            return undefined;
        });
        whisperTranscriber.transcribe.mockResolvedValue('transcribed text');
        ({ AudioService } = await import('../../src/services/audio.service.ts'));
    });

    it('creates media directory when it does not exist', () => {
        mocks.existsSync.mockReturnValue(false);

        setupService();

        expect(mocks.mkdir).toHaveBeenCalledWith(join('/home/test', '.pi', 'agent', 'extensions', 'whatsapp-pi', 'whatsapp-medias'), { recursive: true });
    });

    it('returns trimmed transcription text for a successful audio transcription', async () => {
        mocks.downloadContentFromMessage.mockResolvedValue(
            createStream(Buffer.from('part-1'), Buffer.from('part-2'))
        );
        whisperTranscriber.transcribe.mockResolvedValue('  áudio transcrito  \n');

        const service = setupService();
        const audioMessage = { id: 'audio-1' };

        await expect(service.transcribe(audioMessage as any)).resolves.toBe('áudio transcrito');

        const mediaDir = join('/home/test', '.pi', 'agent', 'extensions', 'whatsapp-pi', 'whatsapp-medias');
        const inputPath = join(mediaDir, 'audio_1234567890.ogg');
        const wavPath = join(mediaDir, 'audio_1234567890.wav');

        expect(mocks.downloadContentFromMessage).toHaveBeenCalledWith(audioMessage, 'audio');
        expect(mocks.writeFile).toHaveBeenCalledWith(inputPath, Buffer.concat([Buffer.from('part-1'), Buffer.from('part-2')]));
        expect(mocks.execFile).toHaveBeenCalledWith('ffmpeg', ['-y', '-i', inputPath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wavPath], { windowsHide: true }, expect.any(Function));
        expect(whisperTranscriber.transcribe).toHaveBeenCalledWith(wavPath);
        expect(logger.log).toHaveBeenCalledWith('[WhatsApp-Pi] Audio download: 0 ms');
        expect(logger.log).toHaveBeenCalledWith('[WhatsApp-Pi] Audio write file: 0 ms');
        expect(logger.log).toHaveBeenCalledWith('[WhatsApp-Pi] Audio convert: 0 ms');
        expect(logger.log).toHaveBeenCalledWith('[WhatsApp-Pi] Audio whisper: 0 ms');
        expect(logger.log).toHaveBeenCalledWith('[WhatsApp-Pi] Audio total: 0 ms');
    });

    it('returns fallback when transcription output is empty', async () => {
        whisperTranscriber.transcribe.mockResolvedValue('');

        const service = setupService();

        await expect(service.transcribe({ id: 'audio-2' } as any)).resolves.toBe('[Empty transcription]');
    });

    it('returns formatted error when audio download fails', async () => {
        mocks.downloadContentFromMessage.mockRejectedValue(new Error('download failed'));

        const service = setupService();

        await expect(service.transcribe({ id: 'audio-4' } as any)).resolves.toBe(
            '[Transcription error: download failed]'
        );

        expect(console.error).toHaveBeenCalledWith('[AudioService] Transcription error:', expect.any(Error));
    });
});
