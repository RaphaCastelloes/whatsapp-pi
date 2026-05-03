import { SessionManager } from '../../src/services/session.manager.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

describe('SessionManager', () => {
    let sessionManager: SessionManager;
    let dataDir: string;

    beforeEach(async () => {
        dataDir = await mkdtemp(join(tmpdir(), 'whatsapp-pi-session-'));
        sessionManager = new SessionManager(dataDir);
    });

    afterEach(async () => {
        await rm(dataDir, { recursive: true, force: true });
    });

    it('should initialize with logged-out status', () => {
        expect(sessionManager.getStatus()).toBe('logged-out');
    });

    it('should set and get status', async () => {
        await sessionManager.setStatus('connected');
        expect(sessionManager.getStatus()).toBe('connected');
    });

    it('should clear session directory and recreate auth folder', async () => {
        const authDir = sessionManager.getAuthStateDir();
        sessionManager.setStatus('connected');
        
        await sessionManager.deleteAuthState();
        
        expect(sessionManager.getStatus()).toBe('logged-out');
        
        let exists = true;
        try {
            await access(authDir);
        } catch {
            exists = false;
        }
        expect(exists).toBe(true);
    });

    it('should remember auth state once credentials exist on disk', async () => {
        await mkdir(sessionManager.getAuthStateDir(), { recursive: true });
        await writeFile(join(sessionManager.getAuthStateDir(), 'creds.json'), '{}');
        await sessionManager.markAuthStateAvailable();
        expect(await sessionManager.isRegistered()).toBe(true);
    });

    it('should not trust stale config when credentials are missing from disk', async () => {
        await sessionManager.markAuthStateAvailable();

        expect(await sessionManager.isRegistered()).toBe(false);
    });

    it('should recover and rewrite a config file with trailing data', async () => {
        const configPath = join(dataDir, 'config.json');
        await writeFile(configPath, [
            '{',
            '  "allowList": [{ "number": "+1234567890", "name": "Ana" }],',
            '  "blockList": [],',
            '  "ignoredNumbers": [],',
            '  "status": "connected",',
            '  "hasAuthState": false,',
            '  "openaiKey": "",',
            '  "visionModel": "gpt-4o"',
            '} trailing-data'
        ].join('\n'));

        await sessionManager.ensureInitialized();

        expect(sessionManager.getAllowList()).toEqual([{ number: '+1234567890', name: 'Ana' }]);
        expect(sessionManager.getStatus()).toBe('disconnected');
        const rewrittenConfig = await readFile(configPath, 'utf-8');
        expect(() => JSON.parse(rewrittenConfig)).not.toThrow();
    });

    it('should handle block list and mutual exclusivity', async () => {
        const num = '+1234567890';
        await sessionManager.blockNumber(num);
        expect(sessionManager.isBlocked(num)).toBe(true);
        expect(sessionManager.isAllowed(num)).toBe(false);

        await sessionManager.addNumber(num);
        expect(sessionManager.isAllowed(num)).toBe(true);
        expect(sessionManager.isBlocked(num)).toBe(false);

        await sessionManager.blockNumber(num);
        expect(sessionManager.isBlocked(num)).toBe(true);
        expect(sessionManager.isAllowed(num)).toBe(false);
    });

    it('should atomically unblock and allow', async () => {
        const num = '+9876543210';
        await sessionManager.blockNumber(num);
        expect(sessionManager.isBlocked(num)).toBe(true);

        await sessionManager.unblockAndAllow(num);
        expect(sessionManager.isAllowed(num)).toBe(true);
        expect(sessionManager.isBlocked(num)).toBe(false);
    });

    it('should store and retrieve contact names', async () => {
        const num = '+1234567890';
        const name = 'John Doe';
        
        await sessionManager.addNumber(num, name);
        const allowList = sessionManager.getAllowList();
        
        expect(allowList).toHaveLength(1);
        expect(allowList[0].number).toBe(num);
        expect(allowList[0].name).toBe(name);
    });

    it('should add and remove an alias for an existing allowed number', async () => {
        const num = '+1234567890';
        const alias = 'My Contact';

        await sessionManager.addNumber(num);
        await sessionManager.setAllowedContactAlias(num, alias);

        let allowList = sessionManager.getAllowList();
        expect(allowList[0].name).toBe(alias);

        await sessionManager.removeAllowedContactAlias(num);
        allowList = sessionManager.getAllowList();
        expect(allowList[0].name).toBeUndefined();
    });

    it('should preserve name when unblocking and allowing', async () => {
        const num = '+5511999999999';
        const name = 'Jane Smith';
        
        await sessionManager.blockNumber(num, name);
        await sessionManager.unblockAndAllow(num);
        
        const allowList = sessionManager.getAllowList();
        expect(allowList[0].name).toBe(name);
    });
});
