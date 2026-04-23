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

    describe('Group Binding', () => {
        it('should process group messages when bound to that group', async () => {
            const callback = vi.fn();
            whatsappService.setMessageCallback(callback);
            await sessionManager.setStatus('connected');
            whatsappService.setGroupBinding('120363012345@g.us');

            await whatsappService.handleIncomingMessages({
                messages: [{
                    key: { remoteJid: '120363012345@g.us', participant: '5511999998888@s.whatsapp.net' },
                    message: { conversation: 'Hello from group' },
                    pushName: 'Ana'
                }]
            });
            expect(callback).toHaveBeenCalledTimes(1);
        });

        it('should ignore group messages from a different group', async () => {
            const callback = vi.fn();
            whatsappService.setMessageCallback(callback);
            await sessionManager.setStatus('connected');
            whatsappService.setGroupBinding('120363012345@g.us');

            await whatsappService.handleIncomingMessages({
                messages: [{
                    key: { remoteJid: '120363099999@g.us', participant: '5511999998888@s.whatsapp.net' },
                    message: { conversation: 'Hello from other group' },
                    pushName: 'Ana'
                }]
            });
            expect(callback).not.toHaveBeenCalled();
        });

        it('should ignore individual messages when a group is bound', async () => {
            const callback = vi.fn();
            whatsappService.setMessageCallback(callback);
            await sessionManager.setStatus('connected');
            whatsappService.setGroupBinding('120363012345@g.us');

            await whatsappService.handleIncomingMessages({
                messages: [{
                    key: { remoteJid: '5511999998888@s.whatsapp.net' },
                    message: { conversation: 'Hello individual' },
                    pushName: 'Ana'
                }]
            });
            expect(callback).not.toHaveBeenCalled();
        });

        it('should track group as ignored when no group binding and group not in allow list', async () => {
            const callback = vi.fn();
            whatsappService.setMessageCallback(callback);
            await sessionManager.setStatus('connected');
            // No group binding set, group JID not in allow list

            await whatsappService.handleIncomingMessages({
                messages: [{
                    key: { remoteJid: '120363012345@g.us', participant: '5511999998888@s.whatsapp.net' },
                    message: { conversation: 'Hello from group' },
                    pushName: 'Ana'
                }]
            });
            // Should NOT call the message callback (not allowed)
            expect(callback).not.toHaveBeenCalled();
        });

        it('should process group messages when group JID is in allow list (no binding)', async () => {
            const callback = vi.fn();
            whatsappService.setMessageCallback(callback);
            await sessionManager.setStatus('connected');
            // Add the group JID to the allow list
            await sessionManager.addNumber('120363012345@g.us');

            await whatsappService.handleIncomingMessages({
                messages: [{
                    key: { remoteJid: '120363012345@g.us', participant: '5511999998888@s.whatsapp.net' },
                    message: { conversation: 'Hello from group' },
                    pushName: 'Ana'
                }]
            });
            expect(callback).toHaveBeenCalledTimes(1);
        });

        it('should set lastRemoteJid to the group JID for group messages', async () => {
            const callback = vi.fn();
            whatsappService.setMessageCallback(callback);
            await sessionManager.setStatus('connected');
            whatsappService.setGroupBinding('120363012345@g.us');

            await whatsappService.handleIncomingMessages({
                messages: [{
                    key: { remoteJid: '120363012345@g.us', participant: '5511999998888@s.whatsapp.net' },
                    message: { conversation: 'Hello' },
                    pushName: 'Ana'
                }]
            });
            expect(whatsappService.getLastRemoteJid()).toBe('120363012345@g.us');
        });

        it('should skip allow/block list checks in group-only mode', async () => {
            const callback = vi.fn();
            whatsappService.setMessageCallback(callback);
            await sessionManager.setStatus('connected');
            whatsappService.setGroupBinding('120363012345@g.us');
            // Do NOT add any numbers to allow list

            await whatsappService.handleIncomingMessages({
                messages: [{
                    key: { remoteJid: '120363012345@g.us', participant: '5511999998888@s.whatsapp.net' },
                    message: { conversation: 'Hello from group' },
                    pushName: 'Ana'
                }]
            });
            // Should still process because group binding bypasses allow list
            expect(callback).toHaveBeenCalledTimes(1);
        });
    });

});
