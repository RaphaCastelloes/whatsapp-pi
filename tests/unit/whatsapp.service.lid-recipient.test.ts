import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetI18n } from '../../src/i18n.ts';

const baileysMocks = vi.hoisted(() => {
    const sockets: any[] = [];

    const createSocket = () => {
        const handlers = new Map<string, (event: any) => Promise<void>>();
        const socket = {
            handlers,
            user: { id: '447879105882:18@s.whatsapp.net', lid: '130476962508942:18@lid' },
            sendMessage: vi.fn().mockResolvedValue(undefined),
            ev: {
                on: vi.fn((event: string, handler: (event: any) => Promise<void>) => {
                    handlers.set(event, handler);
                }),
                removeAllListeners: vi.fn()
            },
            end: vi.fn()
        };
        sockets.push(socket);
        return socket;
    };

    return {
        sockets,
        makeWASocket: vi.fn(() => createSocket()),
        fetchLatestBaileysVersion: vi.fn().mockResolvedValue({ version: [2, 3000, 0] }),
        makeCacheableSignalKeyStore: vi.fn((_keys: any, _logger: any) => _keys),
        reset() {
            sockets.length = 0;
            this.makeWASocket.mockReset().mockImplementation(() => createSocket());
            this.fetchLatestBaileysVersion.mockReset().mockResolvedValue({ version: [2, 3000, 0] });
            this.makeCacheableSignalKeyStore.mockReset().mockImplementation((_keys: any, _logger: any) => _keys);
        }
    };
});

vi.mock('baileys', () => ({
    makeWASocket: baileysMocks.makeWASocket,
    fetchLatestBaileysVersion: baileysMocks.fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore: baileysMocks.makeCacheableSignalKeyStore,
    DisconnectReason: {
        loggedOut: 401,
        badSession: 500,
        connectionReplaced: 440
    }
}));

const createSessionManager = () => ({
    getAuthState: vi.fn().mockResolvedValue({
        state: { creds: {}, keys: {} },
        saveCreds: vi.fn().mockResolvedValue(undefined)
    }),
    markAuthStateAvailable: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockReturnValue('connected'),
    setStatus: vi.fn().mockResolvedValue(undefined),
    deleteAuthState: vi.fn().mockResolvedValue(undefined),
    isAllowed: vi.fn().mockReturnValue(true),
    isConversationAllowed: vi.fn().mockReturnValue(true),
    getAllowedContact: vi.fn().mockReturnValue(undefined),
    getOperatorJid: vi.fn().mockReturnValue(''),
    setOperatorJid: vi.fn().mockResolvedValue(undefined)
});

describe('WhatsAppService LID recipient resolution', () => {
    beforeEach(() => {
        resetI18n();
        baileysMocks.reset();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    const createService = async () => {
        const { WhatsAppService } = await import('../../src/services/whatsapp.service.ts');
        const sessionManager = createSessionManager();
        const service = new WhatsAppService(sessionManager as any);
        await service.start();
        return service;
    };

    it('rewrites the account\'s own LID from @s.whatsapp.net form to @lid', async () => {
        const service = await createService();
        expect(service.resolveOutboundRecipientJid('130476962508942@s.whatsapp.net')).toBe('130476962508942@lid');
        await service.stop();
    });

    it('leaves an already-LID-form recipient untouched', async () => {
        const service = await createService();
        expect(service.resolveOutboundRecipientJid('130476962508942@lid')).toBe('130476962508942@lid');
        await service.stop();
    });

    it('keeps regular phone-number JIDs unchanged', async () => {
        const service = await createService();
        expect(service.resolveOutboundRecipientJid('447879105882@s.whatsapp.net')).toBe('447879105882@s.whatsapp.net');
        await service.stop();
    });

    it('keeps group JIDs unchanged', async () => {
        const service = await createService();
        expect(service.resolveOutboundRecipientJid('120363012345@g.us')).toBe('120363012345@g.us');
        await service.stop();
    });
});
