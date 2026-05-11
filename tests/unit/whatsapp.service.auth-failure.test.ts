import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetI18n } from '../../src/i18n.ts';

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
            this.makeWASocket.mockReset().mockImplementation(() => createSocket());
            this.fetchLatestBaileysVersion.mockReset().mockResolvedValue({ version: [2, 3000, 0] });
            this.makeCacheableSignalKeyStore.mockReset().mockImplementation((_keys, _logger) => _keys);
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
    isAllowed: vi.fn().mockReturnValue(true),
    isConversationAllowed: vi.fn().mockReturnValue(true)
});

describe('WhatsAppService auth failure handling', () => {
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

    it('preserves rejected saved auth on manual connect failure', async () => {
        const { WhatsAppService } = await import('../../src/services/whatsapp.service.ts');
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
        const { WhatsAppService } = await import('../../src/services/whatsapp.service.ts');
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

    it('backs off reconnect attempts and preserves credentials before replacing socket', async () => {
        vi.useFakeTimers();
        const { WhatsAppService } = await import('../../src/services/whatsapp.service.ts');
        const authState = await createSessionManager().getAuthState();
        const sessionManager = {
            ...createSessionManager(),
            getAuthState: vi.fn().mockResolvedValue(authState)
        };
        const service = new WhatsAppService(sessionManager as any);
        const statusCallback = vi.fn();
        service.setStatusCallback(statusCallback);

        await service.start();
        await baileysMocks.sockets[0].handlers.get('connection.update')!({
            connection: 'close',
            lastDisconnect: {
                error: {
                    message: 'connection lost',
                    output: { statusCode: 408 }
                }
            }
        });

        expect(authState.saveCreds).toHaveBeenCalledOnce();
        expect(baileysMocks.sockets[0].end).toHaveBeenCalledOnce();
        expect(baileysMocks.makeWASocket).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(4_999);
        expect(baileysMocks.makeWASocket).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(1);
        expect(baileysMocks.makeWASocket).toHaveBeenCalledTimes(2);

        await baileysMocks.sockets[1].handlers.get('connection.update')!({
            connection: 'close',
            lastDisconnect: {
                error: {
                    message: 'connection lost',
                    output: { statusCode: 408 }
                }
            }
        });

        await vi.advanceTimersByTimeAsync(9_999);
        expect(baileysMocks.makeWASocket).toHaveBeenCalledTimes(2);

        await vi.advanceTimersByTimeAsync(1);
        expect(baileysMocks.makeWASocket).toHaveBeenCalledTimes(3);
        expect(statusCallback).toHaveBeenCalledWith('| WhatsApp: Reconnecting...');

        await service.stop();
    });
});
