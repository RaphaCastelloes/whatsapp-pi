import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import {
    createAgentSession, DefaultResourceLoader, getAgentDir, ModelRuntime, SessionManager,
    type AgentSession, type ExtensionAPI, type ExtensionContext, type ToolDefinition
} from '@earendil-works/pi-coding-agent';
import { getDefaultStorageRoot } from './storage-path.js';

export interface IsolatedChat {
    accountScope: string;
    conversation: string;
}

interface SessionMetadata {
    version: 1;
    sessionFile: string;
    provider: string;
    modelId: string;
    thinkingLevel?: ExtensionContext['thinkingLevel'];
}

interface Runtime {
    session: AgentSession;
    workspace: string;
}

type SessionHooks = (pi: ExtensionAPI) => void;

/** Owns one persistent Pi runtime and one serialized work queue per WhatsApp chat. */
export class IsolatedSessionService {
    private readonly sessions = new Map<string, Runtime>();
    private readonly queues = new Map<string, Promise<void>>();
    private readonly active = new Map<string, AbortController>();
    private closing = false;

    constructor(
        private readonly tools: () => ToolDefinition<any, any>[],
        private readonly hooks: (chat: IsolatedChat) => SessionHooks,
        private readonly root = join(getDefaultStorageRoot(), 'isolated'),
        private readonly agentDir = getAgentDir()
    ) {}

    private key(chat: IsolatedChat): string {
        return JSON.stringify([chat.accountScope, chat.conversation]);
    }

    workspace(chat: IsolatedChat): string {
        const hash = (value: string) => createHash('sha256').update(value).digest('hex');
        return join(this.root, hash(chat.accountScope), hash(chat.conversation), 'workspace');
    }

    private async open(chat: IsolatedChat, ctx: ExtensionContext): Promise<Runtime> {
        if (this.closing) throw new Error('Isolated sessions are shutting down');
        const key = this.key(chat);
        const existing = this.sessions.get(key);
        if (existing) return existing;

        const workspace = this.workspace(chat);
        const sessionDir = join(workspace, '..', 'session');
        const metadataPath = join(sessionDir, 'metadata.json');
        await mkdir(workspace, { recursive: true });
        await mkdir(sessionDir, { recursive: true });
        let metadata: SessionMetadata | undefined;
        try {
            const value: unknown = JSON.parse(await readFile(metadataPath, 'utf8'));
            if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1 ||
                !('sessionFile' in value) || typeof value.sessionFile !== 'string' ||
                basename(value.sessionFile) !== value.sessionFile || !value.sessionFile.endsWith('.jsonl') ||
                !('provider' in value) || typeof value.provider !== 'string' || !value.provider ||
                !('modelId' in value) || typeof value.modelId !== 'string' || !value.modelId ||
                ('thinkingLevel' in value && !['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(String(value.thinkingLevel)))) {
                throw new Error('Invalid isolated session metadata');
            }
            metadata = value as SessionMetadata;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }

        const model = metadata ? ctx.modelRegistry.find(metadata.provider, metadata.modelId) : ctx.model;
        if (!model) throw new Error('The isolated session model is unavailable');
        let manager: SessionManager;
        if (metadata) {
            const sessionFile = join(sessionDir, metadata.sessionFile);
            const info = await stat(sessionFile);
            if (!info.isFile() || info.size === 0) throw new Error('Isolated session file is missing or empty');
            const lines = (await readFile(sessionFile, 'utf8')).split('\n').filter(line => line.trim());
            const entries: unknown[] = lines.map(line => JSON.parse(line));
            const header = entries[0];
            if (!header || typeof header !== 'object' || !('type' in header) || header.type !== 'session' ||
                !('cwd' in header) || typeof header.cwd !== 'string' || resolve(header.cwd) !== resolve(workspace)) {
                throw new Error('Invalid isolated session header');
            }
            manager = SessionManager.open(sessionFile, sessionDir, workspace);
        } else {
            // Open an empty, exclusively created file so Pi immediately writes its header.
            // A missing/corrupt metadata file can then never silently replace an old session.
            const sessionFile = join(sessionDir, 'session.jsonl');
            await writeFile(sessionFile, '', { flag: 'wx' });
            manager = SessionManager.open(sessionFile, sessionDir, workspace);
            metadata = {
                version: 1, sessionFile: basename(sessionFile),
                provider: model.provider, modelId: model.id, thinkingLevel: ctx.thinkingLevel
            };
            await writeFile(metadataPath, JSON.stringify(metadata), { flag: 'wx' });
        }

        const loader = new DefaultResourceLoader({
            cwd: workspace, agentDir: this.agentDir, noExtensions: true,
            extensionFactories: [this.hooks(chat)]
        });
        await loader.reload();
        const modelRuntime = await ModelRuntime.create({
            authPath: join(this.agentDir, 'auth.json'), modelsPath: join(this.agentDir, 'models.json')
        });
        for (const providerId of ctx.modelRegistry.getRegisteredProviderIds()) {
            const native = ctx.modelRegistry.getRegisteredNativeProvider(providerId);
            const config = ctx.modelRegistry.getRegisteredProviderConfig(providerId);
            if (native) modelRuntime.registerNativeProvider(native);
            if (config) modelRuntime.registerProvider(providerId, config);
        }
        if (!modelRuntime.hasConfiguredAuth(model.provider) && !await modelRuntime.checkAuth(model.provider)) {
            const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
            if (auth.ok && auth.apiKey) await modelRuntime.setRuntimeApiKey(model.provider, auth.apiKey);
        }
        const { session } = await createAgentSession({
            cwd: workspace, agentDir: this.agentDir, sessionManager: manager, resourceLoader: loader, modelRuntime,
            customTools: this.tools(), model,
            thinkingLevel: metadata.thinkingLevel
        });
        try {
            await session.bindExtensions({});
            if (this.closing) throw new Error('Isolated sessions are shutting down');
            const runtime = { session, workspace };
            this.sessions.set(key, runtime);
            return runtime;
        } catch (error) {
            session.dispose();
            throw error;
        }
    }

    enqueue(chat: IsolatedChat, ctx: ExtensionContext, work: (runtime: Runtime, isLive: () => boolean) => Promise<void>, isCurrent: () => boolean = () => true): Promise<void> {
        const key = this.key(chat);
        const previous = this.queues.get(key) ?? Promise.resolve();
        const next = previous.catch(() => {}).then(async () => {
            const controller = new AbortController();
            const isLive = () => !this.closing && !controller.signal.aborted && isCurrent();
            if (!isLive()) throw new Error('Isolated session request is no longer current');
            this.active.set(key, controller);
            try {
                const runtime = await this.open(chat, ctx);
                if (!isLive()) throw new Error('Isolated session request is no longer current');
                await work(runtime, isLive);
            } finally {
                if (this.active.get(key) === controller) this.active.delete(key);
            }
        });
        this.queues.set(key, next);
        void next.finally(() => {
            if (this.queues.get(key) === next) this.queues.delete(key);
        }).catch(() => {});
        return next;
    }

    async abort(chat: IsolatedChat): Promise<boolean> {
        const key = this.key(chat);
        const controller = this.active.get(key);
        if (!controller) return false;
        controller.abort();
        await this.sessions.get(key)?.session.abort();
        return true;
    }

    async hasSession(chat: IsolatedChat): Promise<boolean> {
        if (this.sessions.has(this.key(chat))) return true;
        try {
            await stat(join(this.workspace(chat), '..', 'session', 'metadata.json'));
            return true;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
            throw error;
        }
    }

    async shutdown(): Promise<void> {
        this.closing = true;
        for (const controller of this.active.values()) controller.abort();
        await Promise.allSettled([...this.sessions.values()].map(runtime => runtime.session.abort()));
        await Promise.allSettled([...this.queues.values()]);
        for (const { session } of this.sessions.values()) session.dispose();
        this.sessions.clear();
    }
}
