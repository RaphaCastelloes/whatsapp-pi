import { createHash, randomUUID } from 'node:crypto';
import { chmod, lstat, mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import {
    createAgentSession, DefaultResourceLoader, getAgentDir, ModelRuntime, SessionManager,
    type AgentSession, type ExtensionAPI, type ExtensionContext, type ToolDefinition
} from '@earendil-works/pi-coding-agent';
import { getDefaultStorageRoot } from './storage-path.js';

export interface IsolatedChat {
    accountScope: string;
    conversation: string;
}

export type IsolatedSessionContext = Pick<ExtensionContext, 'model' | 'modelRegistry' | 'thinkingLevel'>;

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

interface PendingRequest {
    key: string;
    controller: AbortController;
    isCurrent: () => boolean;
}

type SessionHooks = (pi: ExtensionAPI) => void;

/** Owns one persistent Pi runtime and one serialized work queue per WhatsApp chat. */
export class IsolatedSessionService {
    private readonly sessions = new Map<string, Runtime>();
    private readonly queues = new Map<string, Promise<void>>();
    private readonly active = new Map<string, AbortController>();
    private readonly pending = new Set<PendingRequest>();
    private closing = false;
    private storageReady?: Promise<void>;

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

    async secureStorage(): Promise<void> {
        if (!this.storageReady) {
            this.storageReady = (async () => {
                await mkdir(this.root, { recursive: true, mode: 0o700 });
                if ((await lstat(this.root)).isSymbolicLink()) throw new Error('Isolated storage root must not be a symlink');
                if (process.platform === 'win32') return;
                const restrict = async (path: string): Promise<void> => {
                    const info = await lstat(path);
                    if (info.isSymbolicLink()) return;
                    if (info.isDirectory()) {
                        await chmod(path, 0o700);
                        for (const entry of await readdir(path)) await restrict(join(path, entry));
                    } else if (info.isFile()) {
                        await chmod(path, info.mode & 0o700);
                    }
                };
                await restrict(this.root);
            })().catch(error => {
                this.storageReady = undefined;
                throw error;
            });
        }
        await this.storageReady;
    }

    private async open(chat: IsolatedChat, ctx: IsolatedSessionContext, changeModel = false, isLive: () => boolean = () => true): Promise<Runtime> {
        if (this.closing) throw new Error('Isolated sessions are shutting down');
        await this.secureStorage();
        const key = this.key(chat);
        const existing = this.sessions.get(key);
        if (existing) return existing;

        const workspace = this.workspace(chat);
        const chatDir = dirname(workspace);
        const sessionDir = join(chatDir, 'session');
        const metadataPath = join(sessionDir, 'metadata.json');
        for (const dir of [dirname(chatDir), chatDir, workspace, sessionDir]) {
            await mkdir(dir, { recursive: true, mode: 0o700 });
            const info = await lstat(dir);
            if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid isolated session directory');
        }
        let metadata: SessionMetadata | undefined;
        try {
            if (!(await lstat(metadataPath)).isFile()) throw new Error('Invalid isolated session metadata file');
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

        if (changeModel && !metadata) throw new Error('This chat does not have a saved isolated session');
        const model = changeModel ? ctx.model : metadata ? ctx.modelRegistry.find(metadata.provider, metadata.modelId) : ctx.model;
        if (!model) throw new Error('The isolated session model is unavailable; select a model and use /whatsapp-model');
        let manager: SessionManager;
        if (metadata) {
            const sessionFile = join(sessionDir, metadata.sessionFile);
            const info = await lstat(sessionFile);
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
            await writeFile(sessionFile, '', { flag: 'wx', mode: 0o600 });
            manager = SessionManager.open(sessionFile, sessionDir, workspace);
            metadata = {
                version: 1, sessionFile: basename(sessionFile),
                provider: model.provider, modelId: model.id, thinkingLevel: ctx.thinkingLevel
            };
            await writeFile(metadataPath, JSON.stringify(metadata), { flag: 'wx', mode: 0o600 });
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
            if (this.closing || !isLive()) throw new Error('Isolated session request is no longer current');
            if (changeModel) {
                const updated = { ...metadata, provider: model.provider, modelId: model.id, thinkingLevel: ctx.thinkingLevel };
                const temporary = `${metadataPath}.${randomUUID()}.tmp`;
                try {
                    await writeFile(temporary, JSON.stringify(updated), { flag: 'wx', mode: 0o600 });
                    if (!isLive()) throw new Error('Isolated session request is no longer current');
                    await rename(temporary, metadataPath);
                } finally {
                    await unlink(temporary).catch(error => {
                        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
                    });
                }
            }
            const runtime = { session, workspace };
            this.sessions.set(key, runtime);
            return runtime;
        } catch (error) {
            session.dispose();
            throw error;
        }
    }

    private serialize(chat: IsolatedChat, work: (isLive: () => boolean) => Promise<void>, isCurrent: () => boolean): Promise<void> {
        const key = this.key(chat);
        const controller = new AbortController();
        const request = { key, controller, isCurrent };
        this.pending.add(request);
        const previous = this.queues.get(key) ?? Promise.resolve();
        const next = previous.catch(() => {}).then(async () => {
            const isLive = () => !this.closing && !controller.signal.aborted && isCurrent();
            if (!isLive()) throw new Error('Isolated session request is no longer current');
            this.active.set(key, controller);
            try {
                await work(isLive);
            } finally {
                if (this.active.get(key) === controller) this.active.delete(key);
            }
        });
        this.queues.set(key, next);
        void next.finally(() => {
            this.pending.delete(request);
            if (this.queues.get(key) === next) this.queues.delete(key);
        }).catch(() => {});
        return next;
    }

    enqueue(chat: IsolatedChat, ctx: IsolatedSessionContext, work: (runtime: Runtime, isLive: () => boolean) => Promise<void>, isCurrent: () => boolean = () => true): Promise<void> {
        return this.serialize(chat, async isLive => {
            const runtime = await this.open(chat, ctx, false, isLive);
            if (!isLive()) throw new Error('Isolated session request is no longer current');
            await work(runtime, isLive);
        }, isCurrent);
    }

    changeModel(chat: IsolatedChat, ctx: IsolatedSessionContext, isCurrent: () => boolean = () => true): Promise<void> {
        return this.serialize(chat, async isLive => {
            if (!ctx.model) throw new Error('Select a model in Pi first');
            const key = this.key(chat);
            const existing = this.sessions.get(key);
            if (existing) {
                existing.session.dispose();
                this.sessions.delete(key);
            }
            if (!isLive()) throw new Error('Isolated session request is no longer current');
            await this.open(chat, ctx, true, isLive);
        }, isCurrent);
    }

    cancelInvalid(): void {
        this.cancelRequests(request => !request.isCurrent());
    }

    cancelAll(): void {
        this.cancelRequests(() => true);
    }

    private cancelRequests(predicate: (request: PendingRequest) => boolean): void {
        for (const request of this.pending) {
            if (!predicate(request) || request.controller.signal.aborted) continue;
            request.controller.abort();
            if (this.active.get(request.key) === request.controller) {
                const session = this.sessions.get(request.key)?.session;
                if (session) void session.abort().catch(() => {});
            }
        }
    }

    async shutdown(): Promise<void> {
        this.closing = true;
        this.cancelAll();
        await Promise.allSettled([...this.sessions.values()].map(runtime => runtime.session.abort()));
        await Promise.allSettled([...this.queues.values()]);
        for (const { session } of this.sessions.values()) session.dispose();
        this.sessions.clear();
    }
}
