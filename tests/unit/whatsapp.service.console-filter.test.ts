import { beforeEach, describe, expect, it, vi } from 'vitest';

const baileysMocks = vi.hoisted(() => {
    const socket = {
        ev: {
            on: vi.fn(),
            removeAllListeners: vi.fn()
        },
        end: vi.fn()
    };

    return {
        socket,
        makeWASocket: vi.fn(() => socket),
        fetchLatestBaileysVersion: vi.fn().mockResolvedValue({ version: [2, 3000, 0] }),
        makeCacheableSignalKeyStore: vi.fn((_keys, _logger) => _keys)
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

describe('WhatsAppService console filtering', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const createSessionManager = () => ({
        getAuthState: vi.fn().mockResolvedValue({
            state: {
                creds: {},
                keys: {}
            },
            saveCreds: vi.fn().mockResolvedValue(undefined)
        }),
        markAuthStateAvailable: vi.fn().mockResolvedValue(undefined),
        getStatus: vi.fn().mockReturnValue('connected'),
        setStatus: vi.fn().mockResolvedValue(undefined)
    });

    it('suppresses known Baileys decrypt noise after socket startup in quiet mode', async () => {
        const { WhatsAppService } = await import('../../src/services/whatsapp.service.js');
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const service = new WhatsAppService(createSessionManager() as any);

        await service.start();

        console.error('Failed to decrypt message with any known session...');
        console.error('[WhatsApp-Pi] real runtime error');

        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(errorSpy).toHaveBeenCalledWith('[WhatsApp-Pi] real runtime error');

        await service.stop();
        errorSpy.mockRestore();
    });

    it('does not suppress Baileys decrypt noise in verbose mode', async () => {
        const { WhatsAppService } = await import('../../src/services/whatsapp.service.js');
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const service = new WhatsAppService(createSessionManager() as any);
        service.setVerboseMode(true);

        await service.start();

        console.error('Failed to decrypt message with any known session...');

        expect(errorSpy).toHaveBeenCalledWith('Failed to decrypt message with any known session...');

        await service.stop();
        errorSpy.mockRestore();
    });
});
