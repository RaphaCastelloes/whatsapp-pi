import { downloadContentFromMessage } from 'baileys';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { createStoragePaths } from './storage-path.js';
import { t } from '../i18n.js';

const execAsync = promisify(exec);

export class AudioService {
    private readonly mediaDir = createStoragePaths().mediaDir;
    private readonly whisperCommands = process.platform === 'win32'
        ? ['whisper', 'py -m whisper', 'python -m whisper']
        : [join(homedir(), '.local', 'bin', 'whisper'), 'whisper', 'python3 -m whisper', 'python -m whisper'];

    constructor() {
        if (!existsSync(this.mediaDir)) {
            mkdir(this.mediaDir, { recursive: true }).catch(() => {});
        }
    }

    async transcribe(audioMessage: any): Promise<string> {
        try {
            const filename = `audio_${Date.now()}`;
            const inputPath = join(this.mediaDir, `${filename}.ogg`);

            // Download audio content
            const stream = await downloadContentFromMessage(audioMessage, 'audio');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }

            await writeFile(inputPath, buffer);

            // Transcribe using Whisper
            // Using small model for better accuracy
            await this.runWhisper(inputPath);

            const txtPath = join(this.mediaDir, `${filename}.txt`);
            if (existsSync(txtPath)) {
                const fs = await import('node:fs/promises');
                const text = await fs.readFile(txtPath, 'utf8');
                return text.trim();
            }

            return t('audio.emptyTranscription');
        } catch (error) {
            console.error(t('audio.transcriptionError'), error);
            return t('audio.transcriptionErrorResult', { error: error instanceof Error ? error.message : String(error) });
        }
    }

    private async runWhisper(inputPath: string): Promise<void> {
        const commandArgs = `"${inputPath}" --model small --language pt --output_format txt --output_dir "${this.mediaDir}" --fp16 False`;
        let lastError: unknown;

        for (const whisperCommand of this.whisperCommands) {
            const command = `${whisperCommand} ${commandArgs}`;

            try {
                await execAsync(command);
                return;
            } catch (error) {
                lastError = error;
                if (!this.isMissingWhisperCommand(error)) {
                    throw error;
                }
            }
        }

        throw lastError instanceof Error ? lastError : new Error(String(lastError));
    }

    private isMissingWhisperCommand(error: unknown): boolean {
        if (!(error instanceof Error)) {
            return false;
        }

        const anyError = error as Error & { code?: number | string; stderr?: string };
        const message = `${anyError.message}\n${anyError.stderr ?? ''}`;

        return anyError.code === 127
            || anyError.code === 9009
            || /not found|not recognized/i.test(message);
    }
}
