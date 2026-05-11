import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    installBaileysConsoleFilter,
    shouldSuppressBaileysConsoleMessage
} from '../../src/services/baileys-console-filter.ts';

describe('baileys console filter', () => {
    let restoreFilter: (() => void) | undefined;

    afterEach(() => {
        restoreFilter?.();
        restoreFilter = undefined;
        vi.restoreAllMocks();
    });

    it('recognizes noisy Baileys/libsignal decrypt messages', () => {
        expect(shouldSuppressBaileysConsoleMessage([
            'Failed to decrypt message with any known session...'
        ])).toBe(true);

        expect(shouldSuppressBaileysConsoleMessage([
            'Session error:',
            new Error('Bad MAC')
        ])).toBe(true);

        expect(shouldSuppressBaileysConsoleMessage([
            'Closing open session in favor of incoming prekey bundle'
        ])).toBe(true);

        expect(shouldSuppressBaileysConsoleMessage([
            'Closing session:',
            { registrationId: 65653820 }
        ])).toBe(true);
    });

    it('does not suppress unrelated application errors', () => {
        expect(shouldSuppressBaileysConsoleMessage([
            '[WhatsApp-Pi] Failed to send menu message',
            new Error('network down')
        ])).toBe(false);
    });

    it('filters noisy console output while preserving unrelated output', () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        restoreFilter = installBaileysConsoleFilter(false);

        console.error('Failed to decrypt message with any known session...');
        console.error('[WhatsApp-Pi] real error');

        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(errorSpy).toHaveBeenCalledWith('[WhatsApp-Pi] real error');
    });

    it('filters libsignal session close output written through console.info', () => {
        const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
        restoreFilter = installBaileysConsoleFilter(false);

        console.info('Closing session:', { registrationId: 65653820 });
        console.info('[WhatsApp-Pi] real info');

        expect(infoSpy).toHaveBeenCalledTimes(1);
        expect(infoSpy).toHaveBeenCalledWith('[WhatsApp-Pi] real info');
    });

    it('does not install filtering in verbose mode', () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        restoreFilter = installBaileysConsoleFilter(true);

        console.error('Failed to decrypt message with any known session...');

        expect(errorSpy).toHaveBeenCalledWith('Failed to decrypt message with any known session...');
    });
});
