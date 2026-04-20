import { afterEach, describe, expect, it, vi } from 'vitest';
import { WhatsAppPiLogger } from '../../src/services/whatsapp-pi.logger.js';

describe('WhatsAppPiLogger', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('does not write verbose logs when verbose is disabled', () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const logger = new WhatsAppPiLogger(false);

        logger.log('[WhatsApp-Pi] log');
        logger.warn('[WhatsApp-Pi] warn');
        logger.error('[WhatsApp-Pi] error');

        expect(logSpy).not.toHaveBeenCalled();
        expect(warnSpy).not.toHaveBeenCalled();
        expect(errorSpy).not.toHaveBeenCalled();
    });

    it('always writes info logs', () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const logger = new WhatsAppPiLogger(false);

        logger.info('[WhatsApp-Pi] info');

        expect(logSpy).toHaveBeenCalledWith('[WhatsApp-Pi] info');
    });

    it('writes verbose logs when verbose is enabled', () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const logger = new WhatsAppPiLogger(false);

        logger.setVerbose(true);
        logger.log('[WhatsApp-Pi] verbose log');

        expect(logSpy).toHaveBeenCalledWith('[WhatsApp-Pi] verbose log');
    });
});
