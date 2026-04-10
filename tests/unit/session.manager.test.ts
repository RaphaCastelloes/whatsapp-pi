import { SessionManager } from '../../src/services/session.manager.js';
import { describe, it, expect, beforeEach } from 'vitest';
import { rm, access } from 'fs/promises';
import { join } from 'path';

describe('SessionManager', () => {
    let sessionManager: SessionManager;

    beforeEach(() => {
        sessionManager = new SessionManager();
    });

    it('should initialize with logged-out status', () => {
        expect(sessionManager.getStatus()).toBe('logged-out');
    });

    it('should set and get status', async () => {
        await sessionManager.setStatus('connected');
        expect(sessionManager.getStatus()).toBe('connected');
    });

    it('should clear session directory', async () => {
        const authDir = sessionManager.getAuthDir();
        sessionManager.setStatus('connected');
        
        await sessionManager.clearSession();
        
        expect(sessionManager.getStatus()).toBe('logged-out');
        
        let exists = true;
        try {
            await access(authDir);
        } catch {
            exists = false;
        }
        expect(exists).toBe(false);
    });
});
