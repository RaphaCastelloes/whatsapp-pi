import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    ModelRuntime, createAgentSession, DefaultResourceLoader,
    SessionManager, SettingsManager, type ExtensionAPI
} from '@earendil-works/pi-coding-agent';
import { createAssistantMessageEventStream, type AssistantMessage } from '@earendil-works/pi-ai';
import { ConversationRouter } from '../../src/services/conversation-router.service.ts';

const image = {
    type: 'image' as const, mimeType: 'image/png',
    data: 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEElEQVR4nGP4z8DwHwohFABFzAf5Zsv/OQAAAABJRU5ErkJggg=='
};

describe('declared Pi SDK sidecar compatibility', () => {
    it('loads the WhatsApp extension and registers its tools with the current Pi loader', async () => {
        const root = await mkdtemp(join(tmpdir(), 'whatsapp-pi-loader-'));
        try {
            const loader = new DefaultResourceLoader({
                cwd: root, agentDir: root, settingsManager: SettingsManager.inMemory(),
                noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
                additionalExtensionPaths: [join(process.cwd(), 'whatsapp-pi.ts')]
            });
            await loader.reload();
            const { extensions, errors } = loader.getExtensions();
            expect(errors).toEqual([]);
            expect(extensions).toHaveLength(1);
            expect(extensions[0].commands.has('whatsapp')).toBe(true);
            expect(extensions[0].tools.has('send_wa_message')).toBe(true);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    }, 15_000);

    it('uses the real user-input pipeline with policy blocking, transformation and image ownership', async () => {
        const root = await mkdtemp(join(tmpdir(), 'whatsapp-pi-sdk-'));
        const router = new ConversationRouter();
        const policies: string[] = [];
        const mirrors: Array<string | undefined> = [];
        let api!: ExtensionAPI;
        let finishRun: (() => void) | undefined;
        const settings = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } });
        const modelRuntime = await ModelRuntime.create({ authPath: join(root, 'auth.json'), modelsPath: null, refreshOnCreate: false });
        await modelRuntime.setRuntimeApiKey('openai', 'offline-fixture-not-a-credential');
        const loader = new DefaultResourceLoader({
            cwd: root, agentDir: root, settingsManager: settings,
            noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
            extensionFactories: [extension => {
                api = extension;
                extension.on('input', input => {
                    router.observeInput(input);
                    policies.push(input.text);
                    if (input.text.includes('BLOCKED')) return { action: 'handled' };
                    if (input.text.includes('TRANSFORMED')) return { action: 'transform', text: input.text + ' policy suffix', images: input.images };
                    return { action: 'continue' };
                });
                extension.on('agent_start', () => { router.startRun(); });
                extension.on('message_start', event => {
                    if (event.message.role === 'user' || event.message.role === 'custom') router.consume(event.message);
                    if (event.message.role === 'assistant') router.freeze();
                });
                extension.on('message_end', event => { router.buffer(event.message); });
                extension.on('turn_end', () => { mirrors.push(router.mirror()?.snapshot.target); });
                extension.on('agent_end', () => { router.endRun(false); finishRun?.(); });
            }]
        });
        await loader.reload();
        const { session } = await createAgentSession({
            cwd: root, agentDir: root, resourceLoader: loader,
            sessionManager: SessionManager.inMemory(), settingsManager: settings,
            modelRuntime, model: modelRuntime.getModel('openai', 'gpt-4o-mini'), tools: []
        });
        try {
            session.agent.streamFunction = model => {
                const stream = createAssistantMessageEventStream();
                const message: AssistantMessage = {
                    role: 'assistant', api: model.api, provider: model.provider, model: model.id,
                    content: [{ type: 'text', text: 'Offline fixture' }], timestamp: Date.now(), stopReason: 'stop',
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
            await session.bindExtensions({});
            for (const mode of ['text', 'image', 'TRANSFORMED']) {
                const input = router.prepare(mode === 'image' ? [{ type: 'text', text: 'image' }, image] : mode,
                    { remoteJid: '15550000001@s.whatsapp.net', id: mode, fromMe: false });
                const ended = new Promise<void>(resolve => { finishRun = resolve; });
                api.sendUserMessage(input.content as Parameters<ExtensionAPI['sendUserMessage']>[0], { deliverAs: 'followUp' });
                await ended;
            }
            expect(mirrors).toEqual(['15550000001@s.whatsapp.net', '15550000001@s.whatsapp.net', undefined]);
            const blocked = router.prepare('BLOCKED', { remoteJid: '15550000001@s.whatsapp.net', id: 'blocked', fromMe: false });
            await session.sendUserMessage(blocked.content, { deliverAs: 'followUp' });
            expect(policies).toHaveLength(4);
            expect(mirrors).toHaveLength(3);
        } finally {
            session.dispose();
            await rm(root, { recursive: true, force: true });
        }
    }, 15_000);
});
