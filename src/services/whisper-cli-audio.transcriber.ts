import { dirname, join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, stat, unlink } from 'node:fs/promises';
import https from 'node:https';
import { createStoragePaths } from './storage-path.js';
import type { WhatsAppPiLogger } from './whatsapp-pi.logger.js';
import type { AudioTranscriber } from './audio-transcriber.js';

const execFileAsync = promisify(execFile);
const MODEL_FILENAME = 'ggml-base.bin';
const MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin';
type AudioLogger = Pick<WhatsAppPiLogger, 'log' | 'error'>;

function getCliPath() {
    const name = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli';
    return [process.env.WHISPER_CLI_PATH, resolve(process.cwd(), `vendor/whisper.cpp/build/bin/${name}`), resolve(process.cwd(), `vendor/whisper.cpp/build/bin/Release/${name}`), '/home/rapha/whisper.cpp/build/bin/whisper-cli']
        .filter((path): path is string => Boolean(path)).find(existsSync) ?? null;
}
function modelPath() { return join(createStoragePaths().root, 'whisper', 'models', MODEL_FILENAME); }
async function download(url: string, target: string): Promise<void> {
    await mkdir(dirname(target), { recursive: true }); await unlink(target).catch(() => undefined);
    await new Promise<void>((resolvePromise, reject) => {
        const file = createWriteStream(target); const cleanup = () => void unlink(target).catch(() => undefined);
        const request = https.get(url, response => {
            if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                response.resume(); file.close(cleanup); download(new URL(response.headers.location, url).toString(), target).then(resolvePromise).catch(reject); return;
            }
            if (response.statusCode !== 200) { file.close(cleanup); reject(new Error(`Model download failed: HTTP ${response.statusCode}`)); return; }
            response.pipe(file); file.once('finish', () => file.close(error => error ? reject(error) : resolvePromise()));
        });
        request.on('error', error => { file.close(cleanup); reject(error); });
        file.on('error', error => { request.destroy(error); cleanup(); reject(error); });
    });
}
async function ensureModel(logger: AudioLogger) {
    const target = modelPath();
    try { if ((await stat(target)).size > 0) return target; } catch { /* download below */ }
    logger.log(`[WhatsApp-Pi] Whisper.cpp model download: ${target}`); await download(MODEL_URL, target); return target;
}
export function tryCreateWhisperCliAudioTranscriber(logger: AudioLogger): AudioTranscriber | null {
    const cli = getCliPath();
    if (!cli) { logger.error('[WhatsApp-Pi] Whisper.cpp CLI unavailable. Set WHISPER_CLI_PATH or run the build script.'); return null; }
    return { async transcribe(inputPath) {
        const { stdout } = await execFileAsync(cli, ['--model', await ensureModel(logger), '--file', inputPath, '--language', 'pt', '--no-timestamps', '--no-prints'], { windowsHide: true });
        return stdout.trim();
    } };
}
