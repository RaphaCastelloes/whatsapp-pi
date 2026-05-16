import { SessionManager } from '../../src/services/session.manager.ts';
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

    it('should not save stale missing auth state when credentials exist on disk', async () => {
        await mkdir(sessionManager.getAuthStateDir(), { recursive: true });
        await writeFile(join(sessionManager.getAuthStateDir(), 'creds.json'), '{}');

        await sessionManager.setStatus('disconnected');

        const config = JSON.parse(await readFile(join(dataDir, 'config.json'), 'utf-8'));
        expect(config.hasAuthState).toBe(true);
        expect(await sessionManager.isRegistered()).toBe(true);
    });

    it('should recover and rewrite a config file with trailing data', async () => {
        const configPath = join(dataDir, 'config.json');
        await writeFile(configPath, [
            '{',
            '  "allowList": [{ "number": "+1234567890", "name": "Ana" }, { "number": "120363012345@g.us", "name": "Team" }],',
            '  "allowedGroups": [],',
            '  "ignoredNumbers": [],',
            '  "status": "connected",',
            '  "hasAuthState": false,',
            '  "openaiKey": "",',
            '  "visionModel": "gpt-4o"',
            '} trailing-data'
        ].join('\n'));

        await sessionManager.ensureInitialized();

        expect(sessionManager.getAllowList()).toEqual([{ number: '+1234567890', name: 'Ana' }]);
        expect(sessionManager.getAllowedGroups()).toEqual([{ number: '120363012345@g.us', name: 'Team' }]);
        expect(sessionManager.getStatus()).toBe('disconnected');
        const rewrittenConfig = await readFile(configPath, 'utf-8');
        expect(() => JSON.parse(rewrittenConfig)).not.toThrow();
    });

    it('should manage allowed groups separately from allowed numbers', async () => {
        const groupJid = '120363012345@g.us';
        await sessionManager.addAllowedGroup(groupJid, 'Team');

        expect(sessionManager.isAllowedGroup(groupJid)).toBe(true);
        expect(sessionManager.isConversationAllowed(groupJid)).toBe(true);
        expect(sessionManager.isAllowed(groupJid)).toBe(false);
        expect(sessionManager.getAllowList()).toEqual([]);
        expect(sessionManager.getAllowedGroups()).toEqual([{ number: groupJid, name: 'Team' }]);

        await sessionManager.removeAllowedGroup(groupJid);
        expect(sessionManager.isAllowedGroup(groupJid)).toBe(false);
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

    it('should add and remove an alias for an existing allowed group', async () => {
        const groupJid = '120363012345@g.us';
        const alias = 'Team Chat';

        await sessionManager.addAllowedGroup(groupJid);
        await sessionManager.setAllowedGroupAlias(groupJid, alias);

        let allowedGroups = sessionManager.getAllowedGroups();
        expect(allowedGroups[0].name).toBe(alias);

        await sessionManager.removeAllowedGroupAlias(groupJid);
        allowedGroups = sessionManager.getAllowedGroups();
        expect(allowedGroups[0].name).toBeUndefined();
    });

    it('should ignore legacy passive reaction mode when loading groups', async () => {
        const configPath = join(dataDir, 'config.json');
        await writeFile(configPath, JSON.stringify({
            allowList: [],
            allowedGroups: [{ number: '120363012345@g.us', name: 'Team', reactionMode: 'passive' }],
            ignoredNumbers: [],
            status: 'connected',
            hasAuthState: false,
            openaiKey: '',
            visionModel: 'gpt-4o'
        }, null, 2));

        await sessionManager.ensureInitialized();

        expect(sessionManager.getAllowedGroups()).toEqual([{ number: '120363012345@g.us', name: 'Team' }]);
    });
});
