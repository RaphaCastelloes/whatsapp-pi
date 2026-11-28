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
            end: vi.fn(),
            logout: vi.fn().mockResolvedValue(undefined)
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
    isConversationAllowed: vi.fn().mockReturnValue(true)
});

const unexpectedClose = {
    connection: 'close',
    lastDisconnect: { error: { message: 'connection lost', output: { statusCode: 408 } } }
};

describe('WhatsAppService reconnect behaviour', () => {
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

    it('reuses an in-flight start instead of creating concurrent sockets', async () => {
        const { WhatsAppService } = await import('../../src/services/whatsapp.service.ts');
        const sessionManager = createSessionManager();
        let resolveAuthState!: (value: any) => void;
        sessionManager.getAuthState.mockReturnValueOnce(new Promise(resolve => {
            resolveAuthState = resolve;
        }));
        const service = new WhatsAppService(sessionManager as any);

        const firstStart = service.start();
        const secondStart = service.start();
        resolveAuthState({ state: { creds: {}, keys: {} }, saveCreds: vi.fn().mockResolvedValue(undefined) });
        await Promise.all([firstStart, secondStart]);

        expect(baileysMocks.makeWASocket).toHaveBeenCalledOnce();
        await service.stop();
    });

    it('retries after start() fails during auto-reconnect', async () => {
        vi.useFakeTimers();
        const { WhatsAppService } = await import('../../src/services/whatsapp.service.ts');
        const sessionManager = createSessionManager();
        const service = new WhatsAppService(sessionManager as any);

        await service.start();
        expect(baileysMocks.makeWASocket).toHaveBeenCalledTimes(1);

        baileysMocks.makeWASocket.mockImplementationOnce(() => {
            throw new Error('socket initialization error');
        });

        await baileysMocks.sockets[0].handlers.get('connection.update')!(unexpectedClose);

        await vi.advanceTimersByTimeAsync(5_001);
        expect(baileysMocks.makeWASocket).toHaveBeenCalledTimes(2);

        await vi.advanceTimersByTimeAsync(10_001);
        expect(baileysMocks.makeWASocket).toHaveBeenCalledTimes(3);

        await service.stop();
    });

    it('stop() cancels a pending reconnect timer', async () => {
        vi.useFakeTimers();
        const { WhatsAppService } = await import('../../src/services/whatsapp.service.ts');
        const sessionManager = createSessionManager();
        const service = new WhatsAppService(sessionManager as any);

        await service.start();
        await baileysMocks.sockets[0].handlers.get('connection.update')!(unexpectedClose);

        expect(baileysMocks.makeWASocket).toHaveBeenCalledTimes(1);

        await service.stop();

        await vi.advanceTimersByTimeAsync(30_000);
        expect(baileysMocks.makeWASocket).toHaveBeenCalledTimes(1);
    });

    it('notifies session invalidation on account change and intentional disconnect', async () => {
        const { WhatsAppService } = await import('../../src/services/whatsapp.service.ts');
        const service = new WhatsAppService(createSessionManager() as any);
        const invalidated = vi.fn();
        service.setSessionInvalidatedCallback(invalidated);
        await service.start();
        const socket = baileysMocks.sockets[0];
        socket.user = { id: '15550000001@s.whatsapp.net' };
        service.getSessionContext();
        socket.user = { id: '15550000002@s.whatsapp.net' };
        service.getSessionContext();
        expect(invalidated).toHaveBeenCalledTimes(1);
        await service.stop();
        expect(invalidated).toHaveBeenCalledTimes(2);
    });

    it('stop() then start() re-enables auto-reconnect for the next drop', async () => {
        vi.useFakeTimers();
        const { WhatsAppService } = await import('../../src/services/whatsapp.service.ts');
        const sessionManager = createSessionManager();
        const service = new WhatsAppService(sessionManager as any);

        await service.start();
        await service.stop();

        await service.start();
        expect(baileysMocks.makeWASocket).toHaveBeenCalledTimes(2);

        await baileysMocks.sockets[1].handlers.get('connection.update')!(unexpectedClose);

        await vi.advanceTimersByTimeAsync(5_001);
        expect(baileysMocks.makeWASocket).toHaveBeenCalledTimes(3);

        await service.stop();
    });

    it('logout() prevents auto-reconnect', async () => {
        vi.useFakeTimers();
        const { WhatsAppService } = await import('../../src/services/whatsapp.service.ts');
        const sessionManager = createSessionManager();
        const service = new WhatsAppService(sessionManager as any);

        await service.start();
        expect(baileysMocks.makeWASocket).toHaveBeenCalledTimes(1);

        await service.logout();

        await vi.advanceTimersByTimeAsync(30_000);
        expect(baileysMocks.makeWASocket).toHaveBeenCalledTimes(1);
        expect(sessionManager.deleteAuthState).toHaveBeenCalledOnce();
    });
});
