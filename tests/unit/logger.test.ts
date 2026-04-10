import { describe, it, expect, beforeEach } from 'vitest';
import { SessionManager } from '../../src/services/session.manager.js';
import { WhatsAppService } from '../../src/services/whatsapp.service.js';

describe('Logger Configuration', () => {
    let whatsappService: WhatsAppService;
    let sessionManager: SessionManager;

    beforeEach(() => {
        sessionManager = new SessionManager();
        whatsappService = new WhatsAppService(sessionManager);
    });

    it('should default to quiet mode', () => {
        expect(whatsappService.isVerbose()).toBe(false);
    });

    it('should enable verbose mode when set', () => {
        whatsappService.setVerboseMode(true);
        expect(whatsappService.isVerbose()).toBe(true);
    });
});
