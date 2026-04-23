import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    const createSessionManager = () => ({
        ensureInitialized: vi.fn().mockResolvedValue(undefined),
        isRegistered: vi.fn().mockResolvedValue(false),
        setStatus: vi.fn().mockResolvedValue(undefined),
        addNumber: vi.fn().mockResolvedValue(undefined),
        getStatus: vi.fn().mockReturnValue('connected'),
        getAllowList: vi.fn().mockReturnValue([{ number: '+5511999998888', name: 'Ana' }]),
        setGroupJidForAuth: vi.fn()
    });

    const createWhatsAppService = () => ({
        setVerboseMode: vi.fn(),
        setStatusCallback: vi.fn(),
        setIncomingMessageRecorder: vi.fn(),
        setMessageCallback: vi.fn(),
        setGroupBinding: vi.fn(),
        getBoundGroupJid: vi.fn().mockReturnValue(null),
        getStatus: vi.fn().mockReturnValue('connected'),
        isVerbose: vi.fn().mockReturnValue(false),
        isRegistered: vi.fn(),
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue(undefined),
        sendMessage: vi.fn().mockResolvedValue({ success: true, messageId: 'MSG123', attempts: 1 }),
        getLastRemoteJid: vi.fn().mockReturnValue('5511999998888@s.whatsapp.net'),
        markRead: vi.fn(),
        sendPresence: vi.fn().mockResolvedValue(undefined)
    });

    const createRecentsService = () => ({
        ensureInitialized: vi.fn().mockResolvedValue(undefined),
        recordMessage: vi.fn().mockResolvedValue(undefined)
    });

    const createMenuHandler = () => ({
        handleCommand: vi.fn().mockResolvedValue(undefined)
    });

    const createIncomingMediaService = () => ({
        process: vi.fn().mockResolvedValue({ text: 'hello from whatsapp' })
    });

    return {
        sessionManager: createSessionManager(),
        whatsappService: createWhatsAppService(),
        recentsService: createRecentsService(),
        menuHandler: createMenuHandler(),
        incomingMediaService: createIncomingMediaService(),
        extractIncomingText: vi.fn().mockReturnValue({ kind: 'text', text: 'hello from whatsapp' }),
        reset() {
            this.sessionManager = createSessionManager();
            this.whatsappService = createWhatsAppService();
            this.recentsService = createRecentsService();
            this.menuHandler = createMenuHandler();
            this.incomingMediaService = createIncomingMediaService();
            this.extractIncomingText = vi.fn().mockReturnValue({ kind: 'text', text: 'hello from whatsapp' });
        }
    };
});

vi.mock('../../src/services/session.manager.js', () => ({
    SessionManager: vi.fn(() => mocks.sessionManager)
}));

vi.mock('../../src/services/whatsapp.service.js', () => ({
    WhatsAppService: vi.fn(() => mocks.whatsappService)
}));

vi.mock('../../src/services/recents.service.js', () => ({
    RecentsService: vi.fn(() => mocks.recentsService)
}));

vi.mock('../../src/services/audio.service.js', () => ({
    AudioService: vi.fn(() => ({}))
}));

vi.mock('../../src/ui/menu.handler.js', () => ({
    MenuHandler: vi.fn(() => mocks.menuHandler)
}));

vi.mock('../../src/services/incoming-message.resolver.js', () => ({
    extractIncomingText: (...args: unknown[]) => mocks.extractIncomingText(...args)
}));

vi.mock('../../src/services/incoming-media.service.js', () => ({
    IncomingMediaService: vi.fn(() => mocks.incomingMediaService)
}));

type PiHandler = (event: any, ctx: any) => Promise<void>;

interface MockPi {
    flags: Map<string, unknown>;
    handlers: Map<string, PiHandler>;
    commands: Map<string, any>;
    tools: Map<string, any>;
    registerFlag: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    registerCommand: ReturnType<typeof vi.fn>;
    registerTool: ReturnType<typeof vi.fn>;
    getFlag: ReturnType<typeof vi.fn>;
    appendEntry: ReturnType<typeof vi.fn>;
    exec: ReturnType<typeof vi.fn>;
    sendUserMessage: ReturnType<typeof vi.fn>;
}

const createMockPi = (): MockPi => {
    const flags = new Map<string, unknown>();
    const handlers = new Map<string, PiHandler>();
    const commands = new Map<string, any>();
    const tools = new Map<string, any>();

    return {
        flags,
        handlers,
        commands,
        tools,
        registerFlag: vi.fn((name: string, config: unknown) => flags.set(name, config)),
        on: vi.fn((name: string, handler: PiHandler) => handlers.set(name, handler)),
        registerCommand: vi.fn((name: string, command: unknown) => commands.set(name, command)),
        registerTool: vi.fn((tool: { name: string }) => tools.set(tool.name, tool)),
        getFlag: vi.fn().mockReturnValue(false),
        appendEntry: vi.fn(),
        exec: vi.fn().mockResolvedValue({ code: 0 }),
        sendUserMessage: vi.fn()
    };
};

const createMockContext = () => ({
    ui: {
        setStatus: vi.fn(),
        notify: vi.fn()
    },
    sessionManager: {
        getEntries: vi.fn().mockReturnValue([])
    },
    compact: vi.fn(),
    abort: vi.fn()
});

const loadExtension = async () => {
    vi.resetModules();
    const module = await import('../../whatsapp-pi.ts');
    return module.default;
};

describe('whatsapp-pi extension', () => {
    beforeEach(() => {
        mocks.reset();
        vi.clearAllMocks();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('registers flags, command, tool, and lifecycle handlers', async () => {
        const registerExtension = await loadExtension();
        const pi = createMockPi();

        registerExtension(pi as any);

        expect(pi.flags.has('verbose')).toBe(true);
        expect(pi.flags.has('whatsapp-pi-online')).toBe(true);
        expect(pi.flags.has('whatsapp-group')).toBe(true);
        expect(pi.commands.has('whatsapp')).toBe(true);
        expect(pi.tools.has('send_wa_message')).toBe(true);
        expect(pi.handlers.has('session_start')).toBe(true);
        expect(pi.handlers.has('agent_start')).toBe(true);
        expect(pi.handlers.has('message_end')).toBe(true);
        expect(pi.handlers.has('session_shutdown')).toBe(true);
    });

    it('initializes session services and restores saved WhatsApp state on session start', async () => {
        const registerExtension = await loadExtension();
        const pi = createMockPi();
        const ctx = createMockContext();
        ctx.sessionManager.getEntries.mockReturnValue([
            {
                type: 'custom',
                customType: 'whatsapp-state',
                data: {
                    status: 'connected',
                    allowList: [{ number: '+5511999998888', name: 'Ana' }]
                }
            }
        ]);

        registerExtension(pi as any);
        await pi.handlers.get('session_start')!({ reason: 'manual' }, ctx);

        expect(mocks.whatsappService.setVerboseMode).toHaveBeenCalledWith(false);
        expect(ctx.ui.setStatus).toHaveBeenCalledWith('whatsapp', '| WhatsApp: Disconnected');
        expect(mocks.sessionManager.ensureInitialized).toHaveBeenCalledOnce();
        expect(mocks.recentsService.ensureInitialized).toHaveBeenCalledOnce();
        expect(mocks.sessionManager.setStatus).toHaveBeenCalledWith('disconnected');
        expect(mocks.sessionManager.addNumber).toHaveBeenCalledWith('+5511999998888', 'Ana');
        expect(mocks.whatsappService.setIncomingMessageRecorder).toHaveBeenCalledOnce();
    });

    it('preserves saved connected status when startup auto-connect is enabled', async () => {
        const registerExtension = await loadExtension();
        const pi = createMockPi();
        const ctx = createMockContext();
        pi.getFlag.mockReturnValue(true);
        mocks.sessionManager.isRegistered.mockResolvedValue(true);
        ctx.sessionManager.getEntries.mockReturnValue([
            {
                type: 'custom',
                customType: 'whatsapp-state',
                data: {
                    status: 'connected',
                    allowList: []
                }
            }
        ]);

        registerExtension(pi as any);
        await pi.handlers.get('session_start')!({ reason: 'startup' }, ctx);

        expect(mocks.sessionManager.setStatus).toHaveBeenCalledWith('connected');
        expect(mocks.whatsappService.start).toHaveBeenCalledOnce();
    });

    it('auto-connects only on startup when flag is enabled and auth is registered', async () => {
        const registerExtension = await loadExtension();
        const pi = createMockPi();
        const ctx = createMockContext();
        pi.getFlag.mockReturnValue(true);
        mocks.sessionManager.isRegistered.mockResolvedValue(true);

        registerExtension(pi as any);
        await pi.handlers.get('session_start')!({ reason: 'startup' }, ctx);

        expect(ctx.ui.setStatus).toHaveBeenCalledWith('whatsapp', '| WhatsApp: Auto-connecting...');
        expect(mocks.whatsappService.start).toHaveBeenCalledOnce();
    });

    it('wires incoming WhatsApp messages into Pi follow-up user messages', async () => {
        const registerExtension = await loadExtension();
        const pi = createMockPi();

        registerExtension(pi as any);
        const messageCallback = mocks.whatsappService.setMessageCallback.mock.calls[0][0];

        await messageCallback({
            messages: [{
                key: {
                    id: 'WA1',
                    remoteJid: '5511999998888@s.whatsapp.net',
                    fromMe: false
                },
                pushName: 'Ana',
                message: { conversation: 'hello' }
            }]
        });

        expect(mocks.extractIncomingText).toHaveBeenCalledWith({ conversation: 'hello' });
        expect(mocks.incomingMediaService.process).toHaveBeenCalledWith(
            { kind: 'text', text: 'hello from whatsapp' },
            'Ana'
        );
        expect(mocks.whatsappService.markRead).toHaveBeenCalledWith('5511999998888@s.whatsapp.net', 'WA1', false);
        expect(mocks.whatsappService.sendPresence).toHaveBeenCalledWith('5511999998888@s.whatsapp.net', 'composing');
        expect(pi.sendUserMessage).toHaveBeenCalledWith(
            'Message from Ana (5511999998888): hello from whatsapp',
            { deliverAs: 'followUp' }
        );
    });

    it('executes /compact commands received from WhatsApp', async () => {
        const registerExtension = await loadExtension();
        const pi = createMockPi();
        const ctx = createMockContext();
        mocks.incomingMediaService.process.mockResolvedValue({ text: '/compact' });

        registerExtension(pi as any);
        await pi.handlers.get('session_start')!({ reason: 'manual' }, ctx);
        const messageCallback = mocks.whatsappService.setMessageCallback.mock.calls[0][0];

        await messageCallback({
            messages: [{
                key: {
                    id: 'WA1',
                    remoteJid: '5511999998888@s.whatsapp.net',
                    fromMe: false
                },
                pushName: 'Ana',
                message: { conversation: '/compact' }
            }]
        });

        expect(ctx.compact).toHaveBeenCalledOnce();
        expect(mocks.whatsappService.sendMessage).toHaveBeenCalledWith(
            '5511999998888@s.whatsapp.net',
            'Session compacted successfully! ✅'
        );
    });

    it('send_wa_message tool reports disconnected status without sending', async () => {
        const registerExtension = await loadExtension();
        const pi = createMockPi();
        mocks.whatsappService.getStatus.mockReturnValue('disconnected');

        registerExtension(pi as any);
        const result = await pi.tools.get('send_wa_message').execute(
            'tool-call-id',
            { jid: '5511999998888@s.whatsapp.net', message: 'hello' }
        );

        expect(result.isError).toBe(true);
        expect(JSON.parse(result.content[0].text)).toEqual({
            success: false,
            error: 'WhatsApp not connected',
            attempts: 0
        });
        expect(mocks.whatsappService.sendMessage).not.toHaveBeenCalled();
    });

    it('sets group binding on session_start when whatsapp-group flag is set', async () => {
        const registerExtension = await loadExtension();
        const pi = createMockPi();
        const ctx = createMockContext();
        pi.getFlag.mockImplementation((name: string) => {
            if (name === 'whatsapp-group') return '120363012345@g.us';
            return false;
        });

        registerExtension(pi as any);
        await pi.handlers.get('session_start')!({ reason: 'manual' }, ctx);

        expect(mocks.whatsappService.setGroupBinding).toHaveBeenCalledWith('120363012345@g.us');
        expect(mocks.sessionManager.setGroupJidForAuth).toHaveBeenCalledWith('120363012345@g.us');
    });

    it('does not set group binding when whatsapp-group flag is empty', async () => {
        const registerExtension = await loadExtension();
        const pi = createMockPi();
        const ctx = createMockContext();
        pi.getFlag.mockReturnValue(false);

        registerExtension(pi as any);
        await pi.handlers.get('session_start')!({ reason: 'manual' }, ctx);

        expect(mocks.whatsappService.setGroupBinding).not.toHaveBeenCalled();
    });

    it('formats group messages with participant info in the prompt', async () => {
        const registerExtension = await loadExtension();
        const pi = createMockPi();

        registerExtension(pi as any);
        const messageCallback = mocks.whatsappService.setMessageCallback.mock.calls[0][0];

        await messageCallback({
            messages: [{
                key: {
                    id: 'WA-GRP-1',
                    remoteJid: '120363012345@g.us',
                    participant: '5511999998888@s.whatsapp.net',
                    fromMe: false
                },
                pushName: 'Ana',
                message: { conversation: 'hello group' }
            }]
        });

        expect(pi.sendUserMessage).toHaveBeenCalledWith(
            'Message from Ana (5511999998888) in group 120363012345@g.us: hello from whatsapp',
            { deliverAs: 'followUp' }
        );
    });
});
