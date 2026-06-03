import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { createWriteStream } from 'node:fs';
import { mkdir, stat, unlink } from 'node:fs/promises';
import https from 'node:https';
import { createStoragePaths } from './storage-path.js';
import type { WhatsAppPiLogger } from './whatsapp-pi.logger.js';

type WhisperModule = {
    createWhisperContext: (options: { model: string; use_gpu?: boolean; no_prints?: boolean }) => {
        free?: () => void;
    };
    transcribeAsync: (context: { free?: () => void }, options: Record<string, unknown>) => Promise<{
        segments?: Array<[string, string, string] | { text?: string }>;
    }>;
};

type AudioLogger = Pick<WhatsAppPiLogger, 'log' | 'error'>;

type WhisperContext = ReturnType<WhisperModule['createWhisperContext']>;
type WhisperResult = Awaited<ReturnType<WhisperModule['transcribeAsync']>>;

const DEFAULT_MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin';
const MODEL_FILENAME = 'ggml-base.bin';

let whisperModule: WhisperModule | undefined;
let cachedContext: WhisperContext | undefined;
let cachedModelPath: string | undefined;

export interface AudioTranscriber {
    transcribe(inputPath: string): Promise<string>;
}

function loadWhisperModule(): WhisperModule {
    if (whisperModule) {
        return whisperModule;
    }

    const require = createRequire(import.meta.url);
    try {
        whisperModule = require('whisper-cpp-node') as WhisperModule;
        return whisperModule;
    } catch {
        throw new Error('whisper-cpp-node not installed. Run npm install.');
    }
}

function getModelPath(): string {
    const { root } = createStoragePaths();
    return join(root, 'whisper', 'models', MODEL_FILENAME);
}

async function downloadFile(url: string, targetPath: string): Promise<void> {
    await mkdir(dirname(targetPath), { recursive: true });
    await unlink(targetPath).catch(() => undefined);

    await new Promise<void>((resolve, reject) => {
        const file = createWriteStream(targetPath);
        const cleanup = () => void unlink(targetPath).catch(() => undefined);
        const request = https.get(url, (response) => {
            if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                const nextUrl = new URL(response.headers.location, url).toString();
                response.resume();
                file.close(cleanup);
                downloadFile(nextUrl, targetPath).then(resolve).catch(reject);
                return;
            }

            if (response.statusCode !== 200) {
                file.close(cleanup);
                reject(new Error(`Model download failed: HTTP ${response.statusCode}`));
                return;
            }

            response.pipe(file);
            file.once('finish', () => {
                file.close((error) => {
                    if (error) {
                        cleanup();
                        reject(error);
                        return;
                    }

                    resolve();
                });
            });
        });

        request.on('error', (error) => {
            file.close(cleanup);
            reject(error);
        });

        file.on('error', (error) => {
            request.destroy(error);
            cleanup();
            reject(error);
        });
    });
}

async function ensureWhisperModel(logger: AudioLogger): Promise<string> {
    const modelPath = getModelPath();

    try {
        const stats = await stat(modelPath);
        if (stats.size > 0) {
            return modelPath;
        }
    } catch {
        // download below
    }

    logger.log(`[WhatsApp-Pi] Whisper.cpp model download: ${modelPath}`);
    await downloadFile(DEFAULT_MODEL_URL, modelPath);
    return modelPath;
}

async function createContext(modelPath: string, logger: AudioLogger): Promise<WhisperContext> {
    const { createWhisperContext } = loadWhisperModule();
    logger.log('[WhatsApp-Pi] Whisper.cpp context init');
    return createWhisperContext({
        model: modelPath,
        use_gpu: false,
        no_prints: true
    });
}

async function ensureContext(logger: AudioLogger): Promise<WhisperContext> {
    const modelPath = await ensureWhisperModel(logger);
    if (!cachedContext || cachedModelPath !== modelPath) {
        cachedContext?.free?.();
        cachedContext = await createContext(modelPath, logger);
        cachedModelPath = modelPath;
    }

    return cachedContext;
}

function extractText(result: WhisperResult): string {
    const segments = (result?.segments ?? []) as Array<[string, string, string] | { text?: string }>;
    return segments
        .map((segment) => Array.isArray(segment) ? segment[2] : segment.text)
        .map((value) => String(value ?? '').trim())
        .filter(Boolean)
        .join(' ')
        .trim();
}

export function tryCreateWhisperCppAudioTranscriber(logger: AudioLogger): AudioTranscriber | null {
    try {
        loadWhisperModule();
    } catch {
        return null;
    }

    return {
        async transcribe(inputPath: string): Promise<string> {
            const context = await ensureContext(logger);
            const { transcribeAsync } = loadWhisperModule();
            logger.log('[WhatsApp-Pi] Whisper.cpp transcribe');
            const result = await transcribeAsync(context, {
                fname_inp: inputPath,
                language: 'pt',
                no_timestamps: true,
                no_context: false,
                detect_language: false
            });

            return extractText(result);
        }
    };
}

export function freeWhisperCppContext() {
    cachedContext?.free?.();
    cachedContext = undefined;
    cachedModelPath = undefined;
}
