import type { WhatsAppPiLogger } from './whatsapp-pi.logger.js';
import { tryCreateWhisperCliAudioTranscriber } from './whisper-cli-audio.transcriber.js';
import { tryCreateWhisperNodeAudioTranscriber } from './whisper-cpp-node.transcriber.js';
import type { AudioTranscriber } from './audio-transcriber.js';

export type { AudioTranscriber };

type AudioLogger = Pick<WhatsAppPiLogger, 'log' | 'error'>;

export function tryCreateWhisperCppAudioTranscriber(logger: AudioLogger): AudioTranscriber | null {
    // The existing native binding supports Windows/macOS; Linux uses the CLI build.
    if (process.platform === 'win32' || process.platform === 'darwin') {
        return tryCreateWhisperNodeAudioTranscriber(logger) ?? tryCreateWhisperCliAudioTranscriber(logger);
    }

    return tryCreateWhisperCliAudioTranscriber(logger);
}

export function freeWhisperCppContext() {
    // The CLI process owns its model/context. The native binding manages its own context.
}
