import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionManager } from '../../src/services/session.manager.js';
import { WhatsAppService } from '../../src/services/whatsapp.service.js';

describe('WhatsAppService Filtering', () => {
    let whatsappService: WhatsAppService;
    let sessionManager: SessionManager;

    beforeEach(() => {
        sessionManager = new SessionManager();
        whatsappService = new WhatsAppService(sessionManager);
    });

    it('should only process messages if status is connected', async () => {
        const callback = vi.fn();
        whatsappService.setMessageCallback(callback);
        
        await sessionManager.setStatus('disconnected');
        // Simulate message
        whatsappService.handleIncomingMessages({ messages: [{ key: { remoteJid: '123@s.net' } }] });
        
        expect(callback).not.toHaveBeenCalled();
    });

    it('should only process messages if sender is in allow list', async () => {
        const callback = vi.fn();
        whatsappService.setMessageCallback(callback);
        
        await sessionManager.setStatus('connected');
        await sessionManager.addNumber('+1234567890');

        // Allowed
        whatsappService.handleIncomingMessages({ 
            messages: [{ key: { remoteJid: '1234567890@s.whatsapp.net' } }] 
        });
        expect(callback).toHaveBeenCalledTimes(1);

        // Not Allowed
        whatsappService.handleIncomingMessages({ 
            messages: [{ key: { remoteJid: '0987654321@s.whatsapp.net' } }] 
        });
        expect(callback).toHaveBeenCalledTimes(1); // Still 1
    });

    it('should ignore messages sent by the bot (fromMe)', () => {
        const callback = vi.fn();
        whatsappService.setMessageCallback(callback);
        
        sessionManager.setStatus('connected');
        sessionManager.addNumber('+1234567890');

        // fromMe: true
        whatsappService.handleIncomingMessages({ 
            messages: [{ key: { remoteJid: '1234567890@s.whatsapp.net', fromMe: true } }] 
        });
        expect(callback).not.toHaveBeenCalled();
    });
});
