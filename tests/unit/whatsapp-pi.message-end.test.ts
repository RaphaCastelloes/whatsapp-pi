import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetI18n } from '../../src/i18n.ts';

const mocks = vi.hoisted(() => {
    const createSessionManager = () => ({
        ensureInitialized: vi.fn().mockResolvedValue(undefined),
        isRegistered: vi.fn().mockResolvedValue(false),
        setStatus: vi.fn().mockResolvedValue(undefined),
        addNumber: vi.fn().mockResolvedValue(undefined),
        addAllowedGroup: vi.fn().mockResolvedValue(undefined),
        getStatus: vi.fn().mockReturnValue('connected'),
        getAllowList: vi.fn().mockReturnValue([]),
        getAllowedGroups: vi.fn().mockReturnValue([]),
        setGroupJidForAuth: vi.fn()
    });

    const createWhatsAppService = () => ({
        setVerboseMode: vi.fn(),
        setStatusCallback: vi.fn(),
        setIncomingMessageRecorder: vi.fn(),
        setMessageCallback: vi.fn(),
        setGroupBinding: vi.fn(),
        setRecentsService: vi.fn(),
        getBoundGroupJid: vi.fn().mockReturnValue(null),
        getStatus: vi.fn().mockReturnValue('connected'),
        isVerbose: vi.fn().mockReturnValue(false),
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue(undefined),
        sendMessage: vi.fn().mockResolvedValue({ success: true, messageId: 'MSG123', attempts: 1 }),
        resolveOutboundRecipientJid: vi.fn((recipient: string) => recipient),
        canonicalConversation: vi.fn((jid: string) => jid),
        getAccountScope: vi.fn().mockReturnValue('fixture-account'),
        getSessionContext: vi.fn().mockReturnValue({ accountScope: 'fixture-account', generation: 1 }),
        isSessionContextCurrent: vi.fn().mockReturnValue(true),
        markIncomingProcessing: vi.fn(),
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

vi.mock('../../src/services/session.manager.ts', () => ({
    SessionManager: Object.assign(vi.fn(() => mocks.sessionManager), {
        isGroupJid: (jid: string) => jid.endsWith('@g.us')
    })
}));

vi.mock('../../src/services/whatsapp.service.ts', () => ({
    WhatsAppService: vi.fn(() => mocks.whatsappService)
}));

vi.mock('../../src/services/recents.service.ts', () => ({
    RecentsService: vi.fn(() => mocks.recentsService)
}));

vi.mock('../../src/services/audio.service.ts', () => ({
    AudioService: vi.fn(() => ({}))
}));

vi.mock('../../src/ui/menu.handler.ts', () => ({
    MenuHandler: vi.fn(() => mocks.menuHandler)
}));

vi.mock('../../src/services/incoming-message.resolver.ts', () => ({
    extractIncomingText: (...args: unknown[]) => mocks.extractIncomingText(...args)
}));

vi.mock('../../src/services/incoming-media.service.ts', () => ({
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

const makeAssistantEvent = (text: string) => ({
    message: {
        role: 'assistant',
        content: [{ type: 'text', text }]
    }
});

const incoming = (id = 'incoming', jid = '5511999998888@s.whatsapp.net') => ({
    key: { id, remoteJid: jid, fromMe: false },
    pushName: 'Ana',
    senderNumber: '+' + jid.split('@')[0],
    sessionContext: { accountScope: 'fixture-account', generation: 1 },
    message: { conversation: 'hello' }
});

const submit = async (pi: MockPi, ctx: ReturnType<typeof createMockContext>, id = 'incoming', jid?: string) => {
    const callback = mocks.whatsappService.setMessageCallback.mock.calls[0][0];
    await callback(incoming(id, jid));
    const content = pi.sendUserMessage.mock.calls.at(-1)![0] as string;
    await pi.handlers.get('input')!({ source: 'extension', text: content }, ctx);
    await pi.handlers.get('message_start')!({ message: { role: 'user', content: [{ type: 'text', text: content }] } }, ctx);
};

const setup = async () => {
    const registerExtension = await loadExtension();
    const pi = createMockPi();
    const ctx = createMockContext();
    registerExtension(pi as any);
    await pi.handlers.get('session_start')!({}, ctx);
    return { pi, ctx };
};

const beginOwned = async (pi: MockPi, ctx: ReturnType<typeof createMockContext>) => {
    await pi.handlers.get('agent_start')!({}, ctx);
    await submit(pi, ctx);
    await pi.handlers.get('message_start')!(makeAssistantEvent(''), ctx);
};

const finalTurn = async (pi: MockPi, ctx: ReturnType<typeof createMockContext>, text: string) => {
    const event = makeAssistantEvent(text);
    await pi.handlers.get('message_end')!(event, ctx);
    await pi.handlers.get('turn_end')!({ ...event, toolResults: [] }, ctx);
};

describe('whatsapp-pi owned turn delivery', () => {
    beforeEach(() => {
        resetI18n();
        vi.stubEnv('WHATSAPP_PI_LOCALE', '');
        mocks.reset();
        vi.clearAllMocks();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('buffers message_end and sends only at the completed owned turn', async () => {
        const { pi, ctx } = await setup();
        await beginOwned(pi, ctx);
        const event = makeAssistantEvent('Hello back!');
        await pi.handlers.get('message_end')!(event, ctx);
        expect(mocks.whatsappService.sendMessage).not.toHaveBeenCalled();
        await pi.handlers.get('turn_end')!({ ...event, toolResults: [] }, ctx);
        expect(mocks.whatsappService.sendMessage).toHaveBeenCalledWith('5511999998888@s.whatsapp.net', 'Hello back!', true);
        expect(mocks.recentsService.recordMessage).toHaveBeenCalledWith(expect.objectContaining({
            messageId: 'MSG123', senderNumber: '+5511999998888', text: 'Hello back!', direction: 'outgoing'
        }));
        expect(ctx.ui.notify).toHaveBeenCalledWith('Sent reply to WhatsApp contact', 'info');
    });

    it('never mirrors terminal-only turns to an old WhatsApp destination', async () => {
        const { pi, ctx } = await setup();
        await pi.handlers.get('agent_start')!({}, ctx);
        await pi.handlers.get('message_start')!({ message: { role: 'user', content: [{ type: 'text', text: 'terminal' }] } }, ctx);
        await pi.handlers.get('message_start')!(makeAssistantEvent(''), ctx);
        await finalTurn(pi, ctx, 'Local answer');
        expect(mocks.whatsappService.sendMessage).not.toHaveBeenCalled();
    });

    it('skips delivery while disconnected', async () => {
        const { pi, ctx } = await setup();
        await beginOwned(pi, ctx);
        mocks.sessionManager.getStatus.mockReturnValue('disconnected');
        await finalTurn(pi, ctx, 'Hello');
        expect(mocks.whatsappService.sendMessage).not.toHaveBeenCalled();
    });

    it('records failure instead of success if an owned send fails or throws', async () => {
        const { pi, ctx } = await setup();
        await beginOwned(pi, ctx);
        mocks.whatsappService.sendMessage.mockResolvedValueOnce({ success: false, error: 'timeout', attempts: 1 });
        await finalTurn(pi, ctx, 'Failed');
        expect(mocks.recentsService.recordMessage).not.toHaveBeenCalled();
        expect(ctx.ui.notify).toHaveBeenCalledWith('Failed to send WhatsApp reply', 'error');
        mocks.whatsappService.sendMessage.mockRejectedValueOnce(new Error('network'));
        await pi.handlers.get('message_start')!(makeAssistantEvent(''), ctx);
        await finalTurn(pi, ctx, 'Throws');
        expect(mocks.recentsService.recordMessage).not.toHaveBeenCalled();
    });

    it('does not mirror text-plus-tool commentary before or after the tool sends', async () => {
        const { pi, ctx } = await setup();
        await beginOwned(pi, ctx);
        const event = { message: { role: 'assistant', stopReason: 'toolUse', content: [
            { type: 'text', text: 'Sending now' }, { type: 'toolCall', id: 'call', name: 'send_wa_message', arguments: {} }
        ] } };
        await pi.handlers.get('message_end')!(event, ctx);
        expect(mocks.whatsappService.sendMessage).not.toHaveBeenCalled();
        await pi.tools.get('send_wa_message').execute('call', { message: 'Tool message' });
        await pi.handlers.get('turn_end')!({ ...event, toolResults: [] }, ctx);
        await pi.handlers.get('message_start')!(makeAssistantEvent(''), ctx);
        await finalTurn(pi, ctx, 'Redundant confirmation');
        expect(mocks.whatsappService.sendMessage).toHaveBeenCalledOnce();
    });

    it('a tool send to another chat does not suppress the rightful owned final reply', async () => {
        const { pi, ctx } = await setup();
        await beginOwned(pi, ctx);
        await pi.tools.get('send_wa_message').execute('call', { jid: '15550000003@s.whatsapp.net', message: 'Other chat' });
        await pi.handlers.get('message_start')!(makeAssistantEvent(''), ctx);
        await finalTurn(pi, ctx, 'Answer to A');
        expect(mocks.whatsappService.sendMessage).toHaveBeenNthCalledWith(2, '5511999998888@s.whatsapp.net', 'Answer to A', true);
    });

    it('B arriving during A cannot redirect a default tool or reset A suppression', async () => {
        const { pi, ctx } = await setup();
        await beginOwned(pi, ctx);
        const callback = mocks.whatsappService.setMessageCallback.mock.calls[0][0];
        await callback(incoming('B', '15550000002@s.whatsapp.net'));
        mocks.whatsappService.getLastRemoteJid.mockReturnValue('15550000002@s.whatsapp.net');
        await pi.tools.get('send_wa_message').execute('call', { message: 'Still A' });
        expect(mocks.whatsappService.sendMessage).toHaveBeenCalledWith('5511999998888@s.whatsapp.net', 'Still A', true);
        await finalTurn(pi, ctx, 'Duplicate');
        expect(mocks.whatsappService.sendMessage).toHaveBeenCalledOnce();
    });

    it('combined A/B consumption fails closed for automatic and default tool sends', async () => {
        const { pi, ctx } = await setup();
        await pi.handlers.get('agent_start')!({}, ctx);
        await submit(pi, ctx, 'A');
        await submit(pi, ctx, 'B', '15550000002@s.whatsapp.net');
        await pi.handlers.get('message_start')!(makeAssistantEvent(''), ctx);
        await finalTurn(pi, ctx, 'Combined');
        const result = await pi.tools.get('send_wa_message').execute('call', { message: 'No guess' });
        expect(result.isError).toBe(true);
        expect(mocks.whatsappService.sendMessage).not.toHaveBeenCalled();
    });

    it('does not inject slow media preparation after a session reset', async () => {
        const { pi, ctx } = await setup();
        let finish!: (value: { text: string }) => void;
        mocks.incomingMediaService.process.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const callback = mocks.whatsappService.setMessageCallback.mock.calls[0][0];
        const processing = callback(incoming('slow'));
        await pi.handlers.get('session_before_switch')!({}, ctx);
        finish({ text: 'Late media' });
        await processing;
        expect(pi.sendUserMessage).not.toHaveBeenCalled();
    });

    it.each(['Late media', '/abort', '/compact'])('does not inject or execute %s after its account changes during preparation', async text => {
        const { pi, ctx } = await setup();
        let finish!: (value: { text: string }) => void;
        mocks.incomingMediaService.process.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        mocks.whatsappService.isSessionContextCurrent.mockImplementation(context => context?.accountScope === mocks.whatsappService.getAccountScope());
        const callback = mocks.whatsappService.setMessageCallback.mock.calls[0][0];
        const processing = callback(incoming('old-account'));
        mocks.whatsappService.getAccountScope.mockReturnValue('new-account');
        finish({ text });
        await processing;
        expect(pi.sendUserMessage).not.toHaveBeenCalled();
        expect(ctx.abort).not.toHaveBeenCalled();
        expect(ctx.compact).not.toHaveBeenCalled();
        expect(mocks.whatsappService.sendMessage).not.toHaveBeenCalled();
    });

    it('does not revive an owned turn after returning to the same account in a newer generation', async () => {
        const { pi, ctx } = await setup();
        await beginOwned(pi, ctx);
        mocks.whatsappService.getSessionContext.mockReturnValue({ accountScope: 'fixture-account', generation: 3 });
        await finalTurn(pi, ctx, 'Old generation');
        const result = await pi.tools.get('send_wa_message').execute('stale-call', { jid: '15550000003@s.whatsapp.net', message: 'Stale explicit send' });
        expect(result.isError).toBe(true);
        expect(mocks.whatsappService.sendMessage).not.toHaveBeenCalled();
    });

    it('reset clears ownership and a new request gets independent suppression', async () => {
        const { pi, ctx } = await setup();
        await beginOwned(pi, ctx);
        await pi.tools.get('send_wa_message').execute('first', { message: 'First' });
        await pi.handlers.get('agent_end')!({ messages: [makeAssistantEvent('done').message] }, ctx);
        await pi.handlers.get('agent_start')!({}, ctx);
        await submit(pi, ctx, 'new-request');
        await pi.handlers.get('message_start')!(makeAssistantEvent(''), ctx);
        await finalTurn(pi, ctx, 'New reply');
        expect(mocks.whatsappService.sendMessage).toHaveBeenCalledTimes(2);
        await pi.handlers.get('session_before_switch')!({}, ctx);
        await finalTurn(pi, ctx, 'Stale');
        expect(mocks.whatsappService.sendMessage).toHaveBeenCalledTimes(2);
    });
});
