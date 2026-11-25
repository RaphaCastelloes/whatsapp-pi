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
        isConversationAllowed: vi.fn().mockReturnValue(true),
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
        sendContent: vi.fn().mockImplementation(async (request: { onSettled?: (result: unknown) => Promise<void> }) => {
            const result = { success: true, messageId: 'MEDIA123', attempts: 1 };
            await request.onSettled?.(result);
            return result;
        }),
        resolveOutboundRecipientJid: vi.fn((recipient: string) => recipient),
        canonicalConversation: vi.fn((jid: string) => jid),
        getQuotedMessage: vi.fn(),
        getAccountScope: vi.fn().mockReturnValue('fixture-account'),
        hasAccountIdentity: vi.fn().mockReturnValue(true),
        getSessionContext: vi.fn().mockReturnValue({ accountScope: 'fixture-account', generation: 1 }),
        isSessionContextCurrent: vi.fn().mockReturnValue(true),
        markIncomingProcessing: vi.fn(),
        getLastRemoteJid: vi.fn().mockReturnValue('5511999998888@s.whatsapp.net'),
        markRead: vi.fn(),
        sendPresence: vi.fn().mockResolvedValue(undefined),
        setMessageReaction: vi.fn().mockResolvedValue(undefined)
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

    const createOutgoingMediaService = () => ({
        prepare: vi.fn().mockResolvedValue({
            content: { image: { url: 'fixture.jpg' } },
            metadata: { type: 'image', fileName: 'fixture.jpg' },
            dispose: vi.fn().mockResolvedValue(undefined)
        })
    });

    return {
        sessionManager: createSessionManager(),
        whatsappService: createWhatsAppService(),
        recentsService: createRecentsService(),
        menuHandler: createMenuHandler(),
        incomingMediaService: createIncomingMediaService(),
        outgoingMediaService: createOutgoingMediaService(),
        extractIncomingText: vi.fn().mockReturnValue({ kind: 'text', text: 'hello from whatsapp' }),
        router: undefined as any,
        runQueuedJobs: false,
        childPrompt: vi.fn().mockResolvedValue(undefined),
        reset() {
            this.sessionManager = createSessionManager();
            this.whatsappService = createWhatsAppService();
            this.recentsService = createRecentsService();
            this.menuHandler = createMenuHandler();
            this.incomingMediaService = createIncomingMediaService();
            this.outgoingMediaService = createOutgoingMediaService();
            this.extractIncomingText = vi.fn().mockReturnValue({ kind: 'text', text: 'hello from whatsapp' });
            this.router = undefined;
            this.runQueuedJobs = false;
            this.childPrompt = vi.fn().mockResolvedValue(undefined);
        }
    };
});

vi.mock('../../src/services/session.manager.ts', () => ({
    SessionManager: Object.assign(vi.fn(function () { return mocks.sessionManager; }), {
        isGroupJid: (jid: string) => jid.endsWith('@g.us')
    })
}));

vi.mock('../../src/services/conversation-router.service.ts', async importOriginal => {
    const original = await importOriginal<typeof import('../../src/services/conversation-router.service.ts')>();
    return {
        ...original,
        ConversationRouter: class extends original.ConversationRouter {
            constructor(...args: ConstructorParameters<typeof original.ConversationRouter>) {
                super(...args);
                mocks.router ??= this;
            }
        }
    };
});

vi.mock('../../src/services/isolated-session.service.ts', () => ({
    IsolatedSessionService: class {
        constructor(_tools: unknown, private hooks: (chat: unknown) => (pi: unknown) => void) {}
        enqueue(chat: unknown, _ctx: unknown, work: (runtime: unknown, isLive: () => boolean) => Promise<void>, isCurrent: () => boolean) {
            if (!mocks.runQueuedJobs) return new Promise<void>(() => {});
            this.hooks(chat)({ on: vi.fn() });
            return Promise.resolve().then(() => {
                if (!isCurrent()) throw new Error('stale');
                return work({ workspace: 'test-workspace', session: { prompt: mocks.childPrompt, messages: [] } }, isCurrent);
            });
        }
        shutdown = vi.fn().mockResolvedValue(undefined);
    }
}));

vi.mock('../../src/services/whatsapp.service.ts', () => ({
    WhatsAppService: vi.fn(function () { return mocks.whatsappService; })
}));

vi.mock('../../src/services/recents.service.ts', () => ({
    RecentsService: vi.fn(function () { return mocks.recentsService; })
}));

vi.mock('../../src/services/audio.service.ts', () => ({
    AudioService: vi.fn(function () { return {}; })
}));

vi.mock('../../src/ui/menu.handler.ts', () => ({
    MenuHandler: vi.fn(function () { return mocks.menuHandler; })
}));

vi.mock('../../src/services/incoming-message.resolver.ts', () => ({
    extractIncomingText: (...args: unknown[]) => mocks.extractIncomingText(...args)
}));

vi.mock('../../src/services/incoming-media.service.ts', () => ({
    IncomingMediaService: vi.fn(function () { return mocks.incomingMediaService; })
}));

vi.mock('../../src/services/outgoing-media.service.ts', () => ({
    OutgoingMediaService: vi.fn(function () { return mocks.outgoingMediaService; })
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
    const message = incoming(id, jid);
    await callback(message);
    // Exercise the routing hooks with a synthetic owned input; real isolated
    // session dispatch is covered by whatsapp-pi.isolated.test.ts.
    const content = mocks.router.prepare('synthetic input', message.key).content as string;
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

describe('whatsapp-pi routing hooks with synthetic owned turns', () => {
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

    it('clears the processing reaction as soon as the reply tool sends the answer', async () => {
        const { pi, ctx } = await setup();
        await beginOwned(pi, ctx);
        const key = incoming().key;
        expect(mocks.whatsappService.setMessageReaction).toHaveBeenCalledWith(key, '⏳');
        const event = { message: { role: 'assistant', stopReason: 'toolUse', content: [
            { type: 'toolCall', id: 'call', name: 'send_wa_message', arguments: {} }
        ] } };
        await pi.handlers.get('message_end')!(event, ctx);
        expect(mocks.whatsappService.setMessageReaction).not.toHaveBeenCalledWith(key, '');
        await pi.tools.get('send_wa_message').execute('call', { message: 'Tool message' });
        expect(mocks.whatsappService.setMessageReaction).toHaveBeenCalledWith(key, '');
        await pi.handlers.get('turn_end')!({ ...event, toolResults: [] }, ctx);
        await pi.handlers.get('message_start')!(makeAssistantEvent(''), ctx);
        await finalTurn(pi, ctx, 'Done');
        await pi.handlers.get('agent_end')!({ messages: [makeAssistantEvent('Done').message] }, ctx);
        expect(mocks.whatsappService.setMessageReaction.mock.calls.filter(([reactionKey, emoji]) =>
            reactionKey.id === key.id && emoji === ''
        )).toHaveLength(1);
    });

    it('clears the processing reaction after the automatic WhatsApp reply is sent', async () => {
        const { pi, ctx } = await setup();
        await beginOwned(pi, ctx);
        const event = makeAssistantEvent('Hello back!');
        await pi.handlers.get('message_end')!(event, ctx);
        expect(mocks.whatsappService.setMessageReaction).not.toHaveBeenCalledWith(incoming().key, '');
        await pi.handlers.get('turn_end')!({ ...event, toolResults: [] }, ctx);
        expect(mocks.whatsappService.sendMessage).toHaveBeenCalledWith(incoming().key.remoteJid, 'Hello back!', true);
        expect(mocks.whatsappService.setMessageReaction).toHaveBeenCalledWith(incoming().key, '');
    });

    it('clears the processing reaction after a media reply is sent', async () => {
        const { pi, ctx } = await setup();
        await beginOwned(pi, ctx);
        const result = await pi.tools.get('send_wa_media').execute('media', { path: 'fixture.jpg', type: 'image' }, undefined, undefined, { cwd: '.' });
        expect(result.isError).toBe(false);
        expect(mocks.whatsappService.sendContent).toHaveBeenCalledOnce();
        expect(mocks.whatsappService.setMessageReaction).toHaveBeenCalledWith(incoming().key, '');
    });

    it('does not clear the reaction for a failed send or a reply to another chat', async () => {
        const { pi, ctx } = await setup();
        await beginOwned(pi, ctx);
        await pi.tools.get('send_wa_message').execute('other', { jid: '15550000003@s.whatsapp.net', message: 'Other chat' });
        expect(mocks.whatsappService.setMessageReaction).not.toHaveBeenCalledWith(incoming().key, '');
        mocks.whatsappService.sendMessage.mockResolvedValueOnce({ success: false, attempts: 1 });
        await pi.tools.get('send_wa_message').execute('failed', { message: 'Failed reply' });
        expect(mocks.whatsappService.setMessageReaction).not.toHaveBeenCalledWith(incoming().key, '');
        await finalTurn(pi, ctx, 'Successful retry');
        expect(mocks.whatsappService.setMessageReaction).toHaveBeenCalledWith(incoming().key, '');
    });

    it('clears only the answered epoch when another request from the same chat is consumed', async () => {
        const { pi, ctx } = await setup();
        await beginOwned(pi, ctx);
        await submit(pi, ctx, 'follow-up');
        await pi.handlers.get('message_start')!(makeAssistantEvent(''), ctx);
        await finalTurn(pi, ctx, 'Follow-up answer');
        expect(mocks.whatsappService.setMessageReaction).toHaveBeenCalledWith(incoming('follow-up').key, '');
        expect(mocks.whatsappService.setMessageReaction).not.toHaveBeenCalledWith(incoming().key, '');
    });

    it('does not clear the reaction for a queued message not consumed by the finished run', async () => {
        const { pi, ctx } = await setup();
        await beginOwned(pi, ctx);
        const callback = mocks.whatsappService.setMessageCallback.mock.calls[0][0];
        const queued = incoming('B', '15550000002@s.whatsapp.net');
        await callback(queued);
        const content = mocks.router.prepare('synthetic queued input', queued.key).content as string;

        await pi.handlers.get('agent_end')!({ messages: [makeAssistantEvent('Done').message] }, ctx);
        expect(mocks.whatsappService.setMessageReaction).toHaveBeenCalledWith(incoming().key, '');
        expect(mocks.whatsappService.setMessageReaction).not.toHaveBeenCalledWith(queued.key, '');

        await pi.handlers.get('agent_start')!({}, ctx);
        await pi.handlers.get('input')!({ source: 'extension', text: content }, ctx);
        await pi.handlers.get('message_start')!({ message: { role: 'user', content: [{ type: 'text', text: content }] } }, ctx);
        await pi.handlers.get('agent_end')!({ messages: [makeAssistantEvent('Done').message] }, ctx);
        expect(mocks.whatsappService.setMessageReaction).toHaveBeenCalledWith(queued.key, '');
    });

    it('waits for a delayed hourglass send before removing it', async () => {
        const { pi, ctx } = await setup();
        let finish!: () => void;
        mocks.whatsappService.setMessageReaction.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        await beginOwned(pi, ctx);
        const ending = pi.handlers.get('agent_end')!({ messages: [makeAssistantEvent('Done').message] }, ctx);
        expect(mocks.whatsappService.setMessageReaction).not.toHaveBeenCalledWith(incoming().key, '');
        finish();
        await ending;
        expect(mocks.whatsappService.setMessageReaction).toHaveBeenCalledWith(incoming().key, '');
    });

    it('clears the processing reaction for system messages that do not start an agent run', async () => {
        await setup();
        mocks.extractIncomingText.mockReturnValueOnce({ kind: 'system', text: 'system message' });
        await mocks.whatsappService.setMessageCallback.mock.calls[0][0](incoming());
        expect(mocks.whatsappService.setMessageReaction).toHaveBeenNthCalledWith(1, incoming().key, '⏳');
        expect(mocks.whatsappService.setMessageReaction).toHaveBeenNthCalledWith(2, incoming().key, '');
    });

    it('clears the processing reaction if media preparation fails', async () => {
        await setup();
        mocks.runQueuedJobs = true;
        mocks.incomingMediaService.process.mockRejectedValueOnce(new Error('media error'));
        await mocks.whatsappService.setMessageCallback.mock.calls[0][0](incoming());
        await vi.waitFor(() => expect(mocks.whatsappService.setMessageReaction).toHaveBeenCalledWith(incoming().key, ''));
        expect(mocks.childPrompt).not.toHaveBeenCalled();
    });

    it('does not clear an old account reaction using a new account', async () => {
        const { pi, ctx } = await setup();
        await beginOwned(pi, ctx);
        mocks.whatsappService.isSessionContextCurrent.mockReturnValue(false);
        await pi.handlers.get('agent_end')!({ messages: [makeAssistantEvent('Done').message] }, ctx);
        expect(mocks.whatsappService.setMessageReaction).not.toHaveBeenCalledWith(incoming().key, '');
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
        mocks.runQueuedJobs = true;
        let finish!: (value: { text: string }) => void;
        mocks.incomingMediaService.process.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const callback = mocks.whatsappService.setMessageCallback.mock.calls[0][0];
        await callback(incoming('slow'));
        await vi.waitFor(() => expect(mocks.incomingMediaService.process).toHaveBeenCalled());
        await pi.handlers.get('session_before_switch')!({}, ctx);
        finish({ text: 'Late media' });
        await vi.waitFor(() => expect(mocks.whatsappService.setMessageReaction).toHaveBeenCalledWith(incoming('slow').key, ''));
        expect(mocks.childPrompt).not.toHaveBeenCalled();
        expect(pi.sendUserMessage).not.toHaveBeenCalled();
    });

    it.each(['Late media', '/abort', '/compact'])('does not inject or execute %s after its account changes during preparation', async text => {
        const { pi, ctx } = await setup();
        mocks.runQueuedJobs = true;
        let finish!: (value: { text: string }) => void;
        mocks.incomingMediaService.process.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        mocks.whatsappService.isSessionContextCurrent.mockImplementation(context => context?.accountScope === mocks.whatsappService.getAccountScope());
        const callback = mocks.whatsappService.setMessageCallback.mock.calls[0][0];
        await callback(incoming('old-account'));
        await vi.waitFor(() => expect(mocks.incomingMediaService.process).toHaveBeenCalled());
        mocks.whatsappService.getAccountScope.mockReturnValue('new-account');
        finish({ text });
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(mocks.childPrompt).not.toHaveBeenCalled();
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
