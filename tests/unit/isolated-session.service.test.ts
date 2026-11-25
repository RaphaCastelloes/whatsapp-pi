import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelRegistry, ModelRuntime, type ExtensionContext } from '@earendil-works/pi-coding-agent';
import { createAssistantMessageEventStream, type AssistantMessage } from '@earendil-works/pi-ai';
import { IsolatedSessionService, type IsolatedChat } from '../../src/services/isolated-session.service.ts';

const roots: string[] = [];
afterEach(async () => {
    vi.unstubAllEnvs();
    await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function fixture() {
    const root = await mkdtemp(join(tmpdir(), 'wa-isolated-'));
    roots.push(root);
    vi.stubEnv('OPENAI_API_KEY', 'offline-test-key');
    const models = await ModelRuntime.create({ authPath: join(root, 'auth.json'), modelsPath: null, refreshOnCreate: false });
    const model = models.getModel('openai', 'gpt-4o-mini');
    if (!model) throw new Error('Offline model fixture unavailable');
    const ctx = { model, modelRegistry: new ModelRegistry(models), thinkingLevel: 'off' } as ExtensionContext;
    const create = () => new IsolatedSessionService(() => [], () => () => {}, join(root, 'isolated'), root);
    return { root, ctx, create, models };
}

function offline(session: Parameters<Parameters<IsolatedSessionService['enqueue']>[2]>[0]['session'], seen: string[][]) {
    session.agent.streamFunction = (model, context) => {
        seen.push(context.messages.filter(message => message.role === 'user').map(message =>
            message.content.filter(block => block.type === 'text').map(block => block.text).join('')
        ));
        const stream = createAssistantMessageEventStream();
        const message: AssistantMessage = {
            role: 'assistant', api: model.api, provider: model.provider, model: model.id,
            content: [{ type: 'text', text: 'offline answer' }], timestamp: Date.now(), stopReason: 'stop',
            usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }
        };
        queueMicrotask(() => {
            stream.push({ type: 'start', partial: message });
            stream.push({ type: 'done', reason: 'stop', message });
            stream.end();
        });
        return stream;
    };
}

const a: IsolatedChat = { accountScope: 'account-a', conversation: '15550000001@s.whatsapp.net' };
const b: IsolatedChat = { accountScope: 'account-a', conversation: '12000000000@g.us' };

describe('isolated chat sessions', () => {
    it('uses a model provider registered in the main Pi runtime', async () => {
        const { create, ctx, models } = await fixture();
        models.registerProvider('fixture-provider', {
            baseUrl: 'https://example.invalid/v1', apiKey: 'fixture-key', api: 'openai-completions',
            models: [{
                id: 'fixture-model', name: 'Fixture', reasoning: false, input: ['text'],
                contextWindow: 4096, maxTokens: 512,
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
            }]
        });
        const model = models.getModel('fixture-provider', 'fixture-model');
        expect(model).toBeDefined();
        const service = create();
        try {
            await service.enqueue(a, { ...ctx, model }, async ({ session }) => {
                offline(session, []);
                await session.prompt('custom provider');
                expect(session.model?.provider).toBe('fixture-provider');
            });
        } finally {
            await service.shutdown();
        }
    }, 30000);

    it('keeps chats in separate workspaces and resumes their own history after restart', async () => {
        const { create, ctx } = await fixture();
        const first = create();
        const seen: string[][] = [];
        try {
            for (const [chat, prompt] of [[a, 'alpha'], [b, 'bravo']] as const) {
                await first.enqueue(chat, ctx, async ({ session, workspace }) => {
                    expect(workspace).toBe(first.workspace(chat));
                    offline(session, seen);
                    await session.prompt(prompt);
                });
            }
        } finally {
            await first.shutdown();
        }
        const second = create();
        try {
            const changedModel = ctx.modelRegistry.find('openai', 'gpt-4o');
            expect(changedModel).toBeDefined();
            await second.enqueue(a, { ...ctx, model: changedModel }, async ({ session }) => {
                expect(session.model?.id).toBe('gpt-4o-mini');
                offline(session, seen);
                await session.prompt('again');
            });
            expect(first.workspace(a)).not.toBe(first.workspace(b));
            expect(first.workspace(a)).not.toBe(first.workspace({ ...a, accountScope: 'account-b' }));
            expect(seen).toEqual([['alpha'], ['bravo'], ['alpha', 'again']]);
        } finally {
            await second.shutdown();
        }
    }, 30000);

    it('fails closed when a saved session is corrupt or missing', async () => {
        const { create, ctx } = await fixture();
        const first = create();
        await first.enqueue(a, ctx, async ({ session }) => {
            offline(session, []);
            await session.prompt('preserve me');
        });
        await first.shutdown();
        const sessionDir = join(first.workspace(a), '..', 'session');
        const metadata = JSON.parse(await readFile(join(sessionDir, 'metadata.json'), 'utf8')) as { sessionFile: string };
        const sessionPath = join(sessionDir, metadata.sessionFile);
        await rename(sessionPath, `${sessionPath}.backup`);
        const missing = create();
        try {
            await expect(missing.enqueue(a, ctx, async () => {})).rejects.toThrow();
        } finally {
            await missing.shutdown();
        }
        await rename(`${sessionPath}.backup`, sessionPath);
        await writeFile(sessionPath, '{"type":"session"}\nnot-json\n');
        const second = create();
        try {
            await expect(second.enqueue(a, ctx, async () => {
                throw new Error('must not execute');
            })).rejects.toThrow();
        } finally {
            await second.shutdown();
        }
    }, 30000);

    it('serializes work within a chat without blocking a different chat', async () => {
        const { create, ctx } = await fixture();
        const service = create();
        const order: string[] = [];
        let release!: () => void;
        let entered!: () => void;
        const started = new Promise<void>(resolve => { entered = resolve; });
        const wait = new Promise<void>(resolve => { release = resolve; });
        try {
            const one = service.enqueue(a, ctx, async () => { order.push('a1'); entered(); await wait; });
            await started;
            const two = service.enqueue(a, ctx, async () => { order.push('a2'); });
            await service.enqueue(b, ctx, async () => { order.push('b'); });
            expect(order).toEqual(['a1', 'b']);
            release();
            await Promise.all([one, two]);
            expect(order).toEqual(['a1', 'b', 'a2']);
        } finally {
            release();
            await service.shutdown();
        }
    }, 30000);

    it('invalidates work still preparing a prompt during shutdown', async () => {
        const { create, ctx } = await fixture();
        const service = create();
        let release!: () => void;
        let entered!: () => void;
        const started = new Promise<void>(resolve => { entered = resolve; });
        const wait = new Promise<void>(resolve => { release = resolve; });
        let stillLive = true;
        try {
            const first = service.enqueue(a, ctx, async (_runtime, isLive) => {
                entered();
                await wait;
                stillLive = isLive();
            });
            await started;
            const closing = service.shutdown();
            release();
            await Promise.all([first, closing]);
            expect(stillLive).toBe(false);
        } finally {
            release();
            await service.shutdown();
        }
    }, 30000);
});
