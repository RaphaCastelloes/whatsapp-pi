import { beforeEach, describe, expect, it, vi } from 'vitest';

const baileysMocks = vi.hoisted(() => {
    const sockets: any[] = [];

    const createSocket = () => {
        const handlers = new Map<string, (event: any) => Promise<void>>();
        const socket = {
            handlers,
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
        makeCacheableSignalKeyStore: vi.fn((_keys, _logger) => _keys),
        reset() {
            sockets.length = 0;
            this.makeWASocket.mockClear();
            this.fetchLatestBaileysVersion.mockClear();
            this.makeCacheableSignalKeyStore.mockClear();
        }
    };
});

vi.mock('@whiskeysockets/baileys', () => ({
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
        state: {
            creds: {},
            keys: {}
        },
        saveCreds: vi.fn().mockResolvedValue(undefined)
    }),
    markAuthStateAvailable: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockReturnValue('connected'),
    setStatus: vi.fn().mockResolvedValue(undefined),
    deleteAuthState: vi.fn().mockResolvedValue(undefined),
    isBlocked: vi.fn().mockReturnValue(false),
    isAllowed: vi.fn().mockReturnValue(true)
});

describe('WhatsAppService auth failure handling', () => {
    beforeEach(() => {
        baileysMocks.reset();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    it('preserves rejected saved auth on manual connect failure', async () => {
        const { WhatsAppService } = await import('../../src/services/whatsapp.service.js');
        const sessionManager = createSessionManager();
        const service = new WhatsAppService(sessionManager as any);
        const statusCallback = vi.fn();
        service.setStatusCallback(statusCallback);

        await service.start();
        await baileysMocks.sockets[0].handlers.get('connection.update')!({
            connection: 'close',
            lastDisconnect: {
                error: {
                    message: 'logged out',
                    output: { statusCode: 401 }
                }
            }
        });

        expect(sessionManager.deleteAuthState).not.toHaveBeenCalled();
        expect(baileysMocks.makeWASocket).toHaveBeenCalledTimes(1);
        expect(sessionManager.setStatus).toHaveBeenCalledWith('disconnected');
        expect(statusCallback).toHaveBeenCalledWith('| WhatsApp: Session Preserved (Reconnect Failed)');
        expect(statusCallback).toHaveBeenCalledWith('| WhatsApp: Disconnected');

        await service.stop();
    });

    it('does not clear auth or start pairing on auto-connect auth failure', async () => {
        const { WhatsAppService } = await import('../../src/services/whatsapp.service.js');
        const sessionManager = createSessionManager();
        const service = new WhatsAppService(sessionManager as any);
        const statusCallback = vi.fn();
        service.setStatusCallback(statusCallback);

        await service.start({ allowPairingOnAuthFailure: false });
        await baileysMocks.sockets[0].handlers.get('connection.update')!({
            connection: 'close',
            lastDisconnect: {
                error: {
                    message: 'logged out',
                    output: { statusCode: 401 }
                }
            }
        });

        expect(sessionManager.deleteAuthState).not.toHaveBeenCalled();
        expect(baileysMocks.makeWASocket).toHaveBeenCalledTimes(1);
        expect(sessionManager.setStatus).toHaveBeenCalledWith('disconnected');
        expect(statusCallback).toHaveBeenCalledWith('| WhatsApp: Disconnected');

        await service.stop();
    });
});
