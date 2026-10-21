import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetI18n } from '../../src/i18n.ts';

const SELF_JID_NORMALIZED = '5511999998888@s.whatsapp.net';

const baileysMocks = vi.hoisted(() => {
    const sockets: any[] = [];

    const createSocket = () => {
        const handlers = new Map<string, (event: any) => Promise<void>>();
        const socket = {
            handlers,
            user: { id: '5511999998888:0@s.whatsapp.net' },
            sendMessage: vi.fn().mockResolvedValue(undefined),
            sendPresenceUpdate: vi.fn().mockResolvedValue(undefined),
            groupMetadata: vi.fn(),
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
        makeWASocket: vi.fn((_config: any) => createSocket()),
        fetchLatestBaileysVersion: vi.fn().mockResolvedValue({ version: [2, 3000, 0] }),
        makeCacheableSignalKeyStore: vi.fn((_keys: any, _logger: any) => _keys),
        reset() {
            sockets.length = 0;
            this.makeWASocket.mockReset().mockImplementation((_config: any) => createSocket());
            this.fetchLatestBaileysVersion.mockReset().mockResolvedValue({ version: [2, 3000, 0] });
            this.makeCacheableSignalKeyStore.mockReset().mockImplementation((_keys: any, _logger: any) => _keys);
        }
    };
});

vi.mock('baileys', async importOriginal => ({
    ...await importOriginal<typeof import('baileys')>(),
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

describe('WhatsAppService QR welcome message', () => {
    let logSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        resetI18n();
        baileysMocks.reset();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('sends welcome self-message and logs qrConnected after QR pairing', async () => {
        const { WhatsAppService } = await import('../../src/services/whatsapp.service.ts');
        const sessionManager = createSessionManager();
        const service = new WhatsAppService(sessionManager as any);

        await service.start();
        const socket = baileysMocks.sockets[0];

        await socket.handlers.get('connection.update')!({ qr: 'some-qr-string' });
        await socket.handlers.get('connection.update')!({ connection: 'open' });
        await Promise.resolve();

        expect(logSpy).toHaveBeenCalledWith('WhatsApp connected');
        expect(socket.sendMessage).toHaveBeenCalledOnce();
        expect(socket.sendMessage).toHaveBeenCalledWith(
            SELF_JID_NORMALIZED,
            expect.objectContaining({ text: expect.stringContaining('Send me a message') }),
            { messageId: expect.any(String) }
        );

        await service.stop();
    });

    it('does not send welcome when connecting from saved credentials (no QR event)', async () => {
        const { WhatsAppService } = await import('../../src/services/whatsapp.service.ts');
        const sessionManager = createSessionManager();
        const service = new WhatsAppService(sessionManager as any);

        await service.start();
        const socket = baileysMocks.sockets[0];

        await socket.handlers.get('connection.update')!({ connection: 'open' });
        await Promise.resolve();

        expect(socket.sendMessage).not.toHaveBeenCalled();
        const welcomeCalls = logSpy.mock.calls.filter(args => args[0] === 'WhatsApp connected');
        expect(welcomeCalls).toHaveLength(0);

        await service.stop();
    });

    it('provides sent messages to Baileys retry requests without fetching a WA version', async () => {
        const { WhatsAppService } = await import('../../src/services/whatsapp.service.ts');
        const sessionManager = createSessionManager();
        const service = new WhatsAppService(sessionManager as any);
        const sentMessage = { extendedTextMessage: { text: 'hello π' } };

        await service.start();
        const socket = baileysMocks.sockets[0];
        socket.sendMessage.mockResolvedValue({ key: { id: 'MSG123' }, message: sentMessage });
        await socket.handlers.get('connection.update')!({ connection: 'open' });
        await service.sendMessage('5511999998888@s.whatsapp.net', 'hello');

        const config = baileysMocks.makeWASocket.mock.calls[0][0];
        expect(config.version).toBeUndefined();
        expect(baileysMocks.fetchLatestBaileysVersion).not.toHaveBeenCalled();
        await expect(config.getMessage({ remoteJid: SELF_JID_NORMALIZED, id: 'MSG123', fromMe: true })).resolves.toBe(sentMessage);
        await expect(config.getMessage({ remoteJid: SELF_JID_NORMALIZED, id: 'MSG123', fromMe: false })).resolves.toBeUndefined();
        await expect(config.getMessage({ remoteJid: '15550000002@s.whatsapp.net', id: 'MSG123' })).resolves.toBeUndefined();
        await expect(config.getMessage({ id: 'unknown' })).resolves.toBeUndefined();

        await service.stop();
    });

    it.each(['5511999998888@s.whatsapp.net', '120363012345@g.us'])('resolves receipt-shaped outgoing retries for %s without confusing the requester with the author', async jid => {
        const { WhatsAppService } = await import('../../src/services/whatsapp.service.ts');
        const service = new WhatsAppService(createSessionManager() as any);
        const content = { conversation: 'retained outgoing' };
        await service.start();
        const socket = baileysMocks.sockets[0];
        await socket.handlers.get('connection.update')!({ connection: 'open' });
        service.cacheSentMessage('retry', content, {
            remoteJid: jid, fromMe: true,
            ...(jid.endsWith('@g.us') ? { participant: SELF_JID_NORMALIZED } : {})
        });
        const getMessage = baileysMocks.makeWASocket.mock.calls[0][0].getMessage;
        const retry = { remoteJid: jid, id: 'retry', fromMe: true, participant: '15550000002:1@s.whatsapp.net' };
        await expect(getMessage(retry)).resolves.toBe(content);
        await expect(getMessage({ ...retry, fromMe: false })).resolves.toBeUndefined();
        await expect(getMessage({ ...retry, remoteJid: '15550000003@s.whatsapp.net' })).resolves.toBeUndefined();
        expect(service.findMessageKey(jid, 'retry', { fromMe: true, participant: retry.participant })).toBeUndefined();
        socket.user.id = '15550000004@s.whatsapp.net';
        await socket.handlers.get('connection.update')!({ connection: 'open' });
        await expect(getMessage(retry)).resolves.toBeUndefined();
        await service.stop();
    });

    it('ignores old-socket callbacks and retry hooks after a new account connects', async () => {
        const { WhatsAppService } = await import('../../src/services/whatsapp.service.ts');
        const service = new WhatsAppService(createSessionManager() as any);
        const callback = vi.fn();
        service.setMessageCallback(callback);
        await service.start();
        const oldSocket = baileysMocks.sockets[0];
        const oldConfig = baileysMocks.makeWASocket.mock.calls[0][0];
        await oldSocket.handlers.get('connection.update')!({ connection: 'open' });
        await service.start();
        const currentSocket = baileysMocks.sockets[1];
        currentSocket.user.id = '15559999992@s.whatsapp.net';
        await currentSocket.handlers.get('connection.update')!({ connection: 'open' });
        service.cacheSentMessage('same-id', { conversation: 'new account' }, { remoteJid: SELF_JID_NORMALIZED, fromMe: true });
        const retry = { remoteJid: SELF_JID_NORMALIZED, id: 'same-id', fromMe: true };
        await expect(oldConfig.getMessage(retry)).resolves.toBeUndefined();
        const currentConfig = baileysMocks.makeWASocket.mock.calls[1][0];
        await expect(currentConfig.getMessage(retry)).resolves.toEqual({ conversation: 'new account' });
        await oldSocket.handlers.get('lid-mapping.update')!({ lid: '999999999@lid', pn: SELF_JID_NORMALIZED });
        expect(service.canonicalConversation('999999999@lid')).toBe('999999999@lid');
        await oldSocket.handlers.get('messages.upsert')!({ type: 'notify', messages: [{ key: { remoteJid: SELF_JID_NORMALIZED, id: 'stale-input', fromMe: false }, message: { conversation: 'old account' } }] });
        await new Promise<void>(resolve => setImmediate(resolve));
        expect(callback).not.toHaveBeenCalled();
        await service.stop();
    });

    it('preserves the observed top-level author when caching an outgoing group reaction target', async () => {
        const { WhatsAppService } = await import('../../src/services/whatsapp.service.ts');
        const { ReactionSender } = await import('../../src/services/reaction.sender.ts');
        const service = new WhatsAppService(createSessionManager() as any);
        const jid = '120363012345@g.us';
        await service.start();
        const socket = baileysMocks.sockets[0];
        await socket.handlers.get('connection.update')!({ connection: 'open' });
        socket.groupMetadata.mockResolvedValue({ id: jid, subject: 'Group', participants: [] });
        socket.sendMessage.mockResolvedValueOnce({
            key: { remoteJid: jid, id: 'outgoing-group', fromMe: true },
            participant: SELF_JID_NORMALIZED, message: { conversation: 'Group text' }
        });
        await service.sendMessage(jid, 'Group text');
        socket.sendMessage.mockResolvedValueOnce({ key: { id: 'reaction' } });
        const reaction = new ReactionSender(socket, options => service.findMessageKey(options.jid, options.messageId, { fromMe: options.fromMe }));
        await expect(reaction.sendReaction({ jid, messageId: 'outgoing-group', fromMe: true, emoji: '👍' })).resolves.toMatchObject({ success: true });
        expect(socket.sendMessage).toHaveBeenLastCalledWith(jid, {
            react: { text: '👍', key: { remoteJid: jid, id: 'outgoing-group', fromMe: true, participant: SELF_JID_NORMALIZED } }
        });
        await service.stop();
    });

    it('expires sent messages and bounds the retry cache', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(1_000);
        const { WhatsAppService } = await import('../../src/services/whatsapp.service.ts');
        const sessionManager = createSessionManager();
        const service = new WhatsAppService(sessionManager as any);

        await service.start();
        const config = baileysMocks.makeWASocket.mock.calls[0][0];
        for (let index = 0; index <= 500; index++) {
            service.cacheSentMessage(`MSG${index}`, { conversation: `${index}` }, { remoteJid: SELF_JID_NORMALIZED, fromMe: true });
        }

        await expect(config.getMessage({ remoteJid: SELF_JID_NORMALIZED, id: 'MSG0' })).resolves.toBeUndefined();
        await expect(config.getMessage({ remoteJid: SELF_JID_NORMALIZED, id: 'MSG500' })).resolves.toEqual({ conversation: '500' });

        vi.setSystemTime(24 * 60 * 60 * 1000 + 1_001);
        await expect(config.getMessage({ remoteJid: SELF_JID_NORMALIZED, id: 'MSG500' })).resolves.toBeUndefined();

        await service.stop();
    });

    it('invalidates cached group metadata when participants change', async () => {
        const { WhatsAppService } = await import('../../src/services/whatsapp.service.ts');
        const sessionManager = createSessionManager();
        const service = new WhatsAppService(sessionManager as any);
        const groupJid = '120363012345@g.us';

        await service.start();
        const socket = baileysMocks.sockets[0];
        socket.groupMetadata.mockResolvedValue({ id: groupJid, subject: 'Group', participants: [] });
        await socket.handlers.get('connection.update')!({ connection: 'open' });
        await service.prepareGroupSession(groupJid);
        await service.prepareGroupSession(groupJid);
        expect(socket.groupMetadata).toHaveBeenCalledOnce();

        await socket.handlers.get('group-participants.update')!({ id: groupJid });
        await service.prepareGroupSession(groupJid);
        expect(socket.groupMetadata).toHaveBeenCalledTimes(2);

        await service.stop();
    });

    it('does not send welcome on a second connection open after initial QR pairing', async () => {
        const { WhatsAppService } = await import('../../src/services/whatsapp.service.ts');
        const sessionManager = createSessionManager();
        const service = new WhatsAppService(sessionManager as any);

        await service.start();
        const socket = baileysMocks.sockets[0];

        await socket.handlers.get('connection.update')!({ qr: 'some-qr-string' });
        await socket.handlers.get('connection.update')!({ connection: 'open' });
        await Promise.resolve();

        expect(socket.sendMessage).toHaveBeenCalledOnce();

        await socket.handlers.get('connection.update')!({ connection: 'open' });
        await Promise.resolve();

        expect(socket.sendMessage).toHaveBeenCalledOnce();

        await service.stop();
    });

    it('session stays connected when sendQrWelcome send fails', async () => {
        const { WhatsAppService } = await import('../../src/services/whatsapp.service.ts');
        const sessionManager = createSessionManager();
        const service = new WhatsAppService(sessionManager as any);

        await service.start();
        const socket = baileysMocks.sockets[0];
        socket.sendMessage.mockRejectedValue(new Error('network error'));

        await socket.handlers.get('connection.update')!({ qr: 'some-qr-string' });
        await socket.handlers.get('connection.update')!({ connection: 'open' });
        await Promise.resolve();

        expect(sessionManager.setStatus).toHaveBeenCalledWith('connected');

        await service.stop();
    });

    it('propagates status persistence failures before reporting connected', async () => {
        const { WhatsAppService } = await import('../../src/services/whatsapp.service.ts');
        const sessionManager = createSessionManager();
        const statusCallback = vi.fn();
        const service = new WhatsAppService(sessionManager as any);
        service.setStatusCallback(statusCallback);
        sessionManager.setStatus.mockRejectedValueOnce(new Error('write failed'));

        await service.start();
        const socket = baileysMocks.sockets[0];

        await expect(socket.handlers.get('connection.update')!({ connection: 'open' }))
            .rejects.toThrow('write failed');
        expect(statusCallback).not.toHaveBeenCalledWith('| WhatsApp: Connected');

        await service.stop();
    });
});
