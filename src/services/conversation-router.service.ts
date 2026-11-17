import { createHash, randomUUID } from 'node:crypto';
import type { WAMessageKey } from 'baileys';
import { t } from '../i18n.js';

type ContentBlock = { type: string; text?: string; data?: string; mimeType?: string };
export type RoutedContent = string | ContentBlock[];
interface RoutedMessage {
    role: string;
    content?: RoutedContent;
    stopReason?: string;
}
interface PendingRequest {
    key: WAMessageKey;
    scope: string;
    observed: boolean;
    expiresAt: number;
}
interface SendState { inFlight: number; confirmed: boolean; unknown: boolean }
interface Epoch {
    scope: string;
    origins: Map<string, string>;
    unowned: boolean;
    sends: Map<string, SendState>;
}
export interface RoutingSnapshot {
    readonly target?: string;
    readonly canonicalTarget?: string;
    readonly epoch: Epoch;
}
interface SendToken { epoch: Epoch; target: string }
interface SendOutcome { success: boolean; delivery?: 'unknown' }

/** Correlates exact submitted user content; never derives a destination from message text. */
export class ConversationRouter {
    private readonly pending = new Map<string, PendingRequest>();
    private epoch?: Epoch;
    private accumulating = false;
    private frozen?: RoutingSnapshot;
    private buffered?: { snapshot: RoutingSnapshot; text: string; eligible: boolean };
    private active = false;
    private runtimeId = randomUUID();

    constructor(
        private readonly canonical: (jid: string) => string | undefined = jid => jid,
        private readonly scope: () => string = () => 'default',
        private readonly onConsumed: (key: WAMessageKey) => void = () => {}
    ) {}

    public getRuntimeId(): string {
        return this.runtimeId;
    }

    public prepare<T extends RoutedContent>(content: T, key: WAMessageKey): { content: T; requestId: string } {
        for (const [digest, request] of this.pending) {
            if (request.expiresAt <= Date.now()) this.pending.delete(digest);
        }
        if (!key.remoteJid || !key.id || !this.canonical(key.remoteJid)) throw new Error(t('routing.destinationRequired'));
        if (this.pending.size >= 500) throw new Error(t('routing.pendingLimit'));
        const requestId = randomUUID();
        const prefix = `[WhatsApp request ${requestId}]\n`;
        const marked = (typeof content === 'string' ? prefix + content : [
            { type: 'text', text: prefix }, ...content
        ]) as T;
        this.pending.set(this.digest(marked), {
            key: { ...key }, scope: this.scope(), observed: false,
            expiresAt: Date.now() + 24 * 60 * 60 * 1000
        });
        return { content: marked, requestId };
    }

    public observeInput(input: { source: string; text: string; images?: ContentBlock[] }): void {
        const content: RoutedContent = [{ type: 'text', text: input.text }, ...(input.images ?? [])];
        const digest = this.digest(content);
        const pending = this.pending.get(digest);
        if (!pending) return;
        if (input.source === 'extension') pending.observed = true;
        else this.pending.delete(digest);
    }

    public consume(message: RoutedMessage): void {
        if (message.role !== 'user' && message.role !== 'custom') return;
        if (!this.accumulating) {
            this.epoch = { scope: this.scope(), origins: new Map(), unowned: false, sends: new Map() };
            this.accumulating = true;
        }
        const epoch = this.epoch;
        if (!epoch) return;
        const digest = this.digest(message.content ?? '');
        const request = message.role === 'user' ? this.pending.get(digest) : undefined;
        this.pending.delete(digest);
        const jid = request?.key.remoteJid;
        const canonical = jid ? this.canonical(jid) : undefined;
        if (!request?.observed || request.expiresAt <= Date.now() || request.scope !== this.scope() || !jid || !canonical) {
            epoch.unowned = true;
            return;
        }
        epoch.origins.set(canonical, jid);
        this.onConsumed(request.key);
    }

    public startRun(): void {
        this.active = true;
    }

    public freeze(): void {
        this.accumulating = false;
        this.buffered = undefined;
        const epoch = this.epoch ?? { scope: this.scope(), origins: new Map(), unowned: true, sends: new Map() };
        const origins = new Map<string, string>();
        for (const jid of epoch.origins.values()) {
            const canonical = this.canonical(jid);
            if (canonical) origins.set(canonical, jid);
            else epoch.unowned = true;
        }
        epoch.origins = origins;
        const entry = !epoch.unowned && epoch.scope === this.scope() && origins.size === 1
            ? origins.entries().next().value : undefined;
        this.frozen = { epoch, canonicalTarget: entry?.[0], target: entry?.[1] };
    }

    public snapshot(): RoutingSnapshot | undefined {
        return this.frozen;
    }

    public isActive(): boolean {
        return this.active;
    }

    public defaultTarget(): string | undefined {
        const snapshot = this.frozen;
        return snapshot?.target && snapshot.epoch.scope === this.scope() && this.canonical(snapshot.target)
            ? snapshot.target : undefined;
    }

    public buffer(message: RoutedMessage): void {
        if (message.role !== 'assistant' || !this.frozen) return;
        const blocks = typeof message.content === 'string' ? [{ type: 'text', text: message.content }] : message.content ?? [];
        this.buffered = {
            snapshot: this.frozen,
            text: blocks.filter(block => block.type === 'text').map(block => block.text ?? '').join('\n'),
            eligible: !blocks.some(block => block.type === 'toolCall')
                && message.stopReason !== 'error' && message.stopReason !== 'aborted'
        };
    }

    public mirror(): { snapshot: RoutingSnapshot; text: string } | undefined {
        const buffered = this.buffered;
        if (!buffered?.eligible || !buffered.text || !buffered.snapshot.target || !buffered.snapshot.canonicalTarget) return undefined;
        if (buffered.snapshot.epoch.scope !== this.scope()) return undefined;
        const target = this.canonical(buffered.snapshot.target);
        if (!target) return undefined;
        for (const [jid, state] of buffered.snapshot.epoch.sends) {
            if (this.canonical(jid) === target && (state.inFlight > 0 || state.confirmed || state.unknown)) return undefined;
        }
        return { snapshot: buffered.snapshot, text: buffered.text };
    }

    public beginSend(snapshot: RoutingSnapshot | undefined, jid: string): SendToken | undefined {
        const target = this.canonical(jid);
        if (!snapshot || !target || snapshot.epoch.scope !== this.scope()) return undefined;
        const state = snapshot.epoch.sends.get(target) ?? { inFlight: 0, confirmed: false, unknown: false };
        state.inFlight++;
        snapshot.epoch.sends.set(target, state);
        return { epoch: snapshot.epoch, target };
    }

    public finishSend(token: SendToken | undefined, result: SendOutcome): void {
        if (!token) return;
        const state = token.epoch.sends.get(token.target);
        if (!state) return;
        state.inFlight = Math.max(0, state.inFlight - 1);
        state.confirmed ||= result.success;
        state.unknown ||= result.delivery === 'unknown';
        if (!state.inFlight && !state.confirmed && !state.unknown) token.epoch.sends.delete(token.target);
    }

    public endRun(recoverable: boolean): void {
        this.active = false;
        this.buffered = undefined;
        this.frozen = undefined;
        if (!recoverable) {
            this.epoch = undefined;
            this.accumulating = false;
        }
    }

    public reset(): void {
        this.runtimeId = randomUUID();
        this.pending.clear();
        this.epoch = undefined;
        this.frozen = undefined;
        this.buffered = undefined;
        this.accumulating = false;
        this.active = false;
    }

    private digest(content: RoutedContent): string {
        const blocks = typeof content === 'string' ? [{ type: 'text', text: content }] : content;
        const normalized = {
            text: blocks.filter(block => block.type === 'text').map(block => block.text ?? '').join('\n'),
            images: blocks.filter(block => block.type === 'image').map(block => ({ data: block.data, mimeType: block.mimeType }))
        };
        return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
    }
}
