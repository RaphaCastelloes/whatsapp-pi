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
        whatsappService.handleIncomingMessages({ 
            messages: [{ 
                key: { remoteJid: '123@s.net' },
                message: { conversation: 'Hello' }
            }] 
        });
        
        expect(callback).not.toHaveBeenCalled();
    });

    it('should report disconnected effective status when persisted status is connected but socket is absent', async () => {
        await sessionManager.setStatus('connected');

        expect(whatsappService.getStatus()).toBe('connected');
        expect(whatsappService.getEffectiveStatus()).toBe('disconnected');
    });

    it('should send menu messages without the pi suffix', async () => {
        const send = vi.fn().mockResolvedValue({ success: true, messageId: 'MSG1', attempts: 1 });
        (whatsappService as any).messageSender = { send };

        await sessionManager.setStatus('connected');

        await whatsappService.sendMenuMessage('5511999998888@s.whatsapp.net', 'Hello');

        expect(send).toHaveBeenCalledWith({
            recipientJid: '5511999998888@s.whatsapp.net',
            text: 'Hello',
            origin: 'menu'
        });
    });

    it('should only process messages if sender is in allow list', async () => {
        const callback = vi.fn();
        whatsappService.setMessageCallback(callback);
        
        await sessionManager.setStatus('connected');
        await sessionManager.addNumber('+1234567890');

        // Allowed
        whatsappService.handleIncomingMessages({ 
            messages: [{ 
                key: { remoteJid: '1234567890@s.whatsapp.net' },
                message: { conversation: 'Hello' }
            }] 
        });
        expect(callback).toHaveBeenCalledTimes(1);

        // Not Allowed
        whatsappService.handleIncomingMessages({ 
            messages: [{ 
                key: { remoteJid: '0987654321@s.whatsapp.net' },
                message: { conversation: 'Hello' }
            }] 
        });
        expect(callback).toHaveBeenCalledTimes(1); // Still 1
    });

    it('should accept messages sent by me fromMe without pi symbol "π" at last letter', () => {
        const callback = vi.fn();
        whatsappService.setMessageCallback(callback);
        
        sessionManager.setStatus('connected');
        sessionManager.addNumber('+1234567890');

        // fromMe is true and does NOT end with π
        whatsappService.handleIncomingMessages({    
            messages: [{ 
                key: { remoteJid: '1234567890@s.whatsapp.net', fromMe: true },
                message: { conversation: 'Testing Pi' }
            }] 
        });
        expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should ignore messages sent by yourself using my own number ("fromMe" with pi symbol "π" at last letter)', () => {
        const callback = vi.fn();
        whatsappService.setMessageCallback(callback);
        
        sessionManager.setStatus('connected');
        sessionManager.addNumber('+1234567890');

        // fromMe is true and ends with π
        whatsappService.handleIncomingMessages({    
            messages: [{ 
                key: { remoteJid: '1234567890@s.whatsapp.net', fromMe: true },
                message: { conversation: 'Testing Pi π' }
            }] 
        });
        expect(callback).not.toHaveBeenCalled();
    });

});
