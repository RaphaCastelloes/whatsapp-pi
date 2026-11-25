import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentSession, ModelRegistry, ModelRuntime } from '@earendil-works/pi-coding-agent';
import { createAssistantMessageEventStream, type AssistantMessage } from '@earendil-works/pi-ai';

const mocks = vi.hoisted(() => ({
    root: '',
    callback: undefined as ((message: any) => Promise<void>) | undefined,
    send: vi.fn(async () => ({ success: true, messageId: 'sent', attempts: 1 })),
    reaction: vi.fn(async () => {}),
    seen: [] as string[][]
}));

vi.mock('../../src/services/isolated-session.service.ts', async importOriginal => {
    const original = await importOriginal<typeof import('../../src/services/isolated-session.service.ts')>();
    return {
        ...original,
        IsolatedSessionService: class extends original.IsolatedSessionService {
            constructor(tools: ConstructorParameters<typeof original.IsolatedSessionService>[0], hooks: ConstructorParameters<typeof original.IsolatedSessionService>[1]) {
                super(tools, hooks, join(mocks.root, 'isolated'), mocks.root);
            }
        }
    };
});
vi.mock('../../src/services/session.manager.ts', () => ({
    SessionManager: class {
        static isGroupJid(jid: string) { return jid.endsWith('@g.us'); }
        ensureInitialized = vi.fn(async () => {});
        isRegistered = vi.fn(async () => false);
        getStatus = vi.fn(() => 'connected');
        getAllowList = vi.fn(() => []);
        getAllowedGroups = vi.fn(() => []);
        isConversationAllowed = vi.fn(() => true);
    }
}));
vi.mock('../../src/services/whatsapp.service.ts', () => ({
    WhatsAppService: class {
        setRecentsService = vi.fn();
        setMessageCallback = vi.fn((callback: typeof mocks.callback) => { mocks.callback = callback; });
        setStatusCallback = vi.fn();
        setIncomingMessageRecorder = vi.fn();
        setVerboseMode = vi.fn();
        setFullHistorySync = vi.fn();
        canonicalConversation = (jid: string) => jid;
        getSessionContext = () => ({ accountScope: 'account', generation: 1 });
        hasAccountIdentity = () => true;
        isSessionContextCurrent = () => true;
        getStatus = () => 'connected';
        getLastRemoteJid = () => null;
        getOperatorJid = () => null;
        markIncomingProcessing = vi.fn();
        markRead = vi.fn();
        sendPresence = vi.fn(async () => {});
        setMessageReaction = mocks.reaction;
        sendMessage = mocks.send;
        stop = vi.fn(async () => {});
    }
}));
vi.mock('../../src/services/recents.service.ts', () => ({
    RecentsService: class {
        ensureInitialized = vi.fn(async () => {});
        recordMessage = vi.fn(async () => {});
    }
}));
vi.mock('../../src/services/audio.service.ts', () => ({ AudioService: class {} }));
vi.mock('../../src/ui/menu.handler.ts', () => ({ MenuHandler: class {} }));
vi.mock('../../src/services/incoming-message.resolver.ts', () => ({
    extractIncomingText: (message: { conversation: string }) => ({ kind: 'text', text: message.conversation })
}));
vi.mock('../../src/services/incoming-media.service.ts', () => ({
    IncomingMediaService: class {
        process = async (resolved: { text: string }) => resolved.text === 'image normalized'
            ? {
                text: resolved.text, imageMimeType: 'image/png',
                imageBuffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEElEQVR4nGP4z8DwHwohFABFzAf5Zsv/OQAAAABJRU5ErkJggg==', 'base64')
            }
            : { text: resolved.text };
    }
}));

afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    if (mocks.root) await rm(mocks.root, { recursive: true, force: true });
    mocks.root = '';
    mocks.callback = undefined;
    mocks.seen = [];
    mocks.send.mockClear();
    mocks.reaction.mockClear();
});

describe('WhatsApp isolated routing', () => {
    it('runs independent sessions, replies to the originating chat, and restores history', async () => {
        mocks.root = await mkdtemp(join(tmpdir(), 'wa-isolated-extension-'));
        vi.stubEnv('OPENAI_API_KEY', 'offline-test-key');
        const models = await ModelRuntime.create({ authPath: join(mocks.root, 'auth.json'), modelsPath: null, refreshOnCreate: false });
        const model = models.getModel('openai', 'gpt-4o-mini');
        const original = AgentSession.prototype.prompt;
        let releaseHeld: (() => void) | undefined;
        vi.spyOn(AgentSession.prototype, 'prompt').mockImplementation(function (this: AgentSession, text, options) {
            if (text.includes('image normalized')) {
                const internals = this as any;
                const normalize = internals._normalizePromptImages.bind(this);
                internals._normalizePromptImages = async (images: unknown) => {
                    const result = await normalize(images);
                    return { ...result, images: result.images.map((image: any) => ({ ...image, data: `${image.data}AA==` })) };
                };
            }
            this.agent.streamFunction = (selected, context) => {
                const messages = context.messages.filter(message => message.role === 'user').map(message =>
                    message.content.filter(block => block.type === 'text').map(block => block.text).join('')
                );
                mocks.seen.push(messages);
                const stream = createAssistantMessageEventStream();
                const toolCall = messages.at(-1)?.includes('use tool') &&
                    !context.messages.some(message => message.role === 'toolResult' && message.toolCallId === 'isolated-tool');
                const answer: AssistantMessage = {
                    role: 'assistant', api: selected.api, provider: selected.provider, model: selected.id,
                    content: toolCall
                        ? [{ type: 'toolCall', id: 'isolated-tool', name: 'send_wa_message', arguments: { message: 'tool reply' } }]
                        : [{ type: 'text', text: `reply ${mocks.seen.length}` }],
                    timestamp: Date.now(), stopReason: toolCall ? 'toolUse' : 'stop',
                    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
                        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }
                };
                const finish = () => {
                    stream.push({ type: 'start', partial: answer });
                    stream.push({ type: 'done', reason: toolCall ? 'toolUse' : 'stop', message: answer });
                    stream.end();
                };
                if (messages.at(-1)?.includes('hold-one')) releaseHeld = finish;
                else queueMicrotask(finish);
                return stream;
            };
            return original.call(this, text, options);
        });
        const { default: register } = await import('../../whatsapp-pi.ts');
        const start = async () => {
            const handlers = new Map<string, (event: any, ctx: any) => Promise<void>>();
            const pi = {
                on: (name: string, handler: any) => handlers.set(name, handler),
                registerFlag: vi.fn(), registerCommand: vi.fn(), registerTool: vi.fn(),
                getFlag: vi.fn(() => false), sendUserMessage: vi.fn()
            };
            const ctx = {
                model, modelRegistry: new ModelRegistry(models), thinkingLevel: 'off',
                ui: { setStatus: vi.fn(), notify: vi.fn() },
                sessionManager: { getEntries: () => [] }
            };
            register(pi as any);
            await handlers.get('session_start')!({}, ctx);
            return { handlers, pi, ctx };
        };
        const message = (jid: string, id: string, text: string) => ({
            key: { remoteJid: jid, id, fromMe: false }, senderNumber: jid,
            pushName: 'Test', sessionContext: { accountScope: 'account', generation: 1 },
            message: { conversation: text }
        });
        const a = '15550000001@s.whatsapp.net';
        const b = '12000000000@g.us';
        let main = await start();
        await mocks.callback!(message(a, 'a', 'alpha'));
        await vi.waitFor(() => expect(mocks.send).toHaveBeenCalledWith(a, 'reply 1', true));
        await mocks.callback!(message(b, 'b', 'bravo'));
        await vi.waitFor(() => expect(mocks.send).toHaveBeenCalledWith(b, 'reply 2', true));
        expect(main.pi.sendUserMessage).not.toHaveBeenCalled();
        await main.handlers.get('session_shutdown')!({}, main.ctx);
        main = await start();
        try {
            await mocks.callback!(message(a, 'c', 'again'));
            await vi.waitFor(() => expect(mocks.send).toHaveBeenCalledWith(a, 'reply 3', true));
            expect(mocks.seen.map(messages => messages.length)).toEqual([1, 1, 2]);
            expect(mocks.seen[2][0]).toContain('alpha');
            expect(mocks.seen[2].join(' ')).not.toContain('bravo');
            expect(main.pi.sendUserMessage).not.toHaveBeenCalled();
            await mocks.callback!(message(a, 'd', 'use tool'));
            await vi.waitFor(() => expect(mocks.seen.length).toBe(5));
            await mocks.callback!(message(a, 'e', 'hold-one'));
            await vi.waitFor(() => expect(releaseHeld).toBeDefined());
            await mocks.callback!(message(b, 'f', 'concurrent'));
            await vi.waitFor(() => expect(mocks.send).toHaveBeenCalledWith(b, 'reply 7', true));
            releaseHeld!();
            await vi.waitFor(() => expect(mocks.send).toHaveBeenCalledWith(a, 'reply 6', true));
            await mocks.callback!(message(a, 'g', 'image normalized'));
            await vi.waitFor(() => expect(mocks.send).toHaveBeenCalledWith(a, 'reply 8', true));
        } finally {
            await main.handlers.get('session_shutdown')!({}, main.ctx);
        }
        expect(mocks.send).toHaveBeenCalledWith(a, 'tool reply', true, expect.objectContaining({ signal: expect.any(AbortSignal) }));
        expect(mocks.send).toHaveBeenCalledTimes(7);
    }, 30000);
});
