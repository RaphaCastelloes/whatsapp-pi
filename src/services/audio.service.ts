import { downloadContentFromMessage } from 'baileys';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import ffmpegStatic from 'ffmpeg-static';
import { createStoragePaths } from './storage-path.js';
import { WhatsAppPiLogger } from './whatsapp-pi.logger.js';
import { tryCreateWhisperCppAudioTranscriber, type AudioTranscriber } from './whisper-cpp-audio.transcriber.js';
import { t } from '../i18n.js';

const staticFfmpegPath = ffmpegStatic as unknown as string | null;
const execFileAsync = promisify(execFile);

type AudioLogger = Pick<WhatsAppPiLogger, 'log' | 'error'>;
type AudioPhase = 'download' | 'write' | 'convert' | 'whisper' | 'total';

export class AudioService {
    private readonly mediaDir = createStoragePaths().mediaDir;
    private readonly logger: AudioLogger;
    private readonly whisperCppTranscriber: AudioTranscriber | null;
    private readonly ffmpegCommands = [
        process.env.FFMPEG_PATH ?? (process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'),
        ...(staticFfmpegPath ? [staticFfmpegPath] : [])
    ];

    constructor(logger: AudioLogger = new WhatsAppPiLogger(false), whisperCppTranscriber?: AudioTranscriber | null) {
        this.logger = logger;
        this.whisperCppTranscriber = whisperCppTranscriber === undefined
            ? tryCreateWhisperCppAudioTranscriber(logger)
            : whisperCppTranscriber;

        if (!existsSync(this.mediaDir)) {
            mkdir(this.mediaDir, { recursive: true }).catch(() => {});
        }
    }

    async transcribe(audioMessage: any): Promise<string> {
        const totalStart = Date.now();

        try {
            const filename = `audio_${Date.now()}`;
            const inputPath = join(this.mediaDir, `${filename}.ogg`);
            const wavPath = join(this.mediaDir, `${filename}.wav`);

            const buffer = await this.measurePhase('download', async () => {
                const stream = await downloadContentFromMessage(audioMessage, 'audio');
                let output = Buffer.from([]);

                for await (const chunk of stream) {
                    output = Buffer.concat([output, chunk]);
                }

                return output;
            });

            await this.measurePhase('write', async () => {
                await writeFile(inputPath, buffer);
            });

            await this.measurePhase('convert', async () => {
                await this.convertToWav(inputPath, wavPath);
            });

            const whisperCppTranscriber = this.whisperCppTranscriber;
            if (!whisperCppTranscriber) {
                throw new Error('whisper-cpp-node unavailable');
            }

            return await this.measurePhase('whisper', async () => {
                const transcription = await whisperCppTranscriber.transcribe(wavPath);
                const text = String(transcription ?? '').trim();
                return text || t('audio.emptyTranscription');
            });
        } catch (error) {
            console.error(t('audio.transcriptionError'), error);
            return t('audio.transcriptionErrorResult', { error: error instanceof Error ? error.message : String(error) });
        } finally {
            this.logger.log(t('audio.phaseTiming', { phase: t('audio.phase.total'), duration: Date.now() - totalStart }));
        }
    }

    private async measurePhase<T>(phase: Exclude<AudioPhase, 'total'>, action: () => Promise<T>): Promise<T> {
        const start = Date.now();

        try {
            return await action();
        } finally {
            this.logger.log(t('audio.phaseTiming', { phase: this.getPhaseLabel(phase), duration: Date.now() - start }));
        }
    }

    private getPhaseLabel(phase: Exclude<AudioPhase, 'total'>): string {
        switch (phase) {
            case 'download':
                return t('audio.phase.download');
            case 'write':
                return t('audio.phase.write');
            case 'convert':
                return t('audio.phase.convert');
            case 'whisper':
                return t('audio.phase.whisper');
        }
    }

    private async convertToWav(inputPath: string, outputPath: string): Promise<void> {
        const args = ['-y', '-i', inputPath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', outputPath];
        let lastError: unknown;

        for (const command of this.ffmpegCommands) {
            try {
                await execFileAsync(command, args, { windowsHide: true });
                return;
            } catch (error) {
                lastError = error;
                if (!this.isMissingFfmpegCommand(error)) {
                    throw error;
                }
            }
        }

        throw lastError instanceof Error ? lastError : new Error('ffmpeg unavailable');
    }

    private isMissingFfmpegCommand(error: unknown): boolean {
        if (!(error instanceof Error)) {
            return false;
        }

        const anyError = error as Error & { code?: number | string; stderr?: string };
        const message = `${anyError.message}\n${anyError.stderr ?? ''}`;

        return anyError.code === 'ENOENT'
            || anyError.code === 127
            || anyError.code === 9009
            || /not found|not recognized/i.test(message);
    }
}
