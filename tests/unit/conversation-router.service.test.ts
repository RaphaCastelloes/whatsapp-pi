import { describe, expect, it } from 'vitest';
import { ConversationRouter } from '../../src/services/conversation-router.service.ts';

const origin = (jid: string) => ({ id: 'original', remoteJid: jid, fromMe: false });
const A = '15550000001@s.whatsapp.net';
const B = '15550000002@s.whatsapp.net';

const consume = (router: ConversationRouter, jid: string, text = 'hello') => {
    const input = router.prepare(text, origin(jid));
    router.observeInput({ source: 'extension', text: input.content });
    router.consume({ role: 'user', content: [{ type: 'text', text: input.content }] });
    return input;
};

describe('ConversationRouter sidecar provenance', () => {
    it('recognizes only a pending exact submission that passed extension input observation', () => {
        const router = new ConversationRouter();
        const input = router.prepare('hello', origin(A));
        router.startRun();
        router.consume({ role: 'user', content: [{ type: 'text', text: input.content }] });
        router.freeze();
        expect(router.snapshot()?.target).toBeUndefined();
    });

    it('captures A despite B arriving while A is processing', () => {
        const router = new ConversationRouter();
        router.startRun();
        consume(router, A);
        router.freeze();
        const snapshot = router.snapshot()!;
        router.prepare('next', origin(B));
        expect(snapshot.target).toBe(A);
        expect(router.snapshot()?.target).toBe(A);
    });

    it('fails closed for mixed chats, terminal input and transformed content', () => {
        const router = new ConversationRouter();
        router.startRun();
        consume(router, A);
        consume(router, B);
        router.freeze();
        expect(router.snapshot()?.target).toBeUndefined();
        router.consume({ role: 'user', content: [{ type: 'text', text: 'terminal' }] });
        router.freeze();
        expect(router.snapshot()?.target).toBeUndefined();
        const input = router.prepare('changed', origin(A));
        router.observeInput({ source: 'extension', text: input.content });
        router.consume({ role: 'user', content: [{ type: 'text', text: `${input.content}!` }] });
        router.freeze();
        expect(router.snapshot()?.target).toBeUndefined();
    });

    it('does not mirror before tools complete and suppresses the whole owned epoch after a send', () => {
        const router = new ConversationRouter();
        router.startRun();
        consume(router, A);
        router.freeze();
        router.buffer({ role: 'assistant', content: [{ type: 'text', text: 'comment' }, { type: 'toolCall' }], stopReason: 'toolUse' });
        expect(router.mirror()).toBeUndefined();
        const send = router.beginSend(router.snapshot(), A);
        router.finishSend(send, { success: true });
        router.freeze();
        router.buffer({ role: 'assistant', content: [{ type: 'text', text: 'duplicate' }], stopReason: 'stop' });
        expect(router.mirror()).toBeUndefined();
    });

    it('does not suppress A for a definite failure or a send to C, but does for unknown acceptance', () => {
        const router = new ConversationRouter();
        router.startRun();
        consume(router, A);
        router.freeze();
        router.finishSend(router.beginSend(router.snapshot(), B), { success: true });
        router.finishSend(router.beginSend(router.snapshot(), A), { success: false });
        router.buffer({ role: 'assistant', content: [{ type: 'text', text: 'answer' }], stopReason: 'stop' });
        expect(router.mirror()?.text).toBe('answer');
        router.finishSend(router.beginSend(router.snapshot(), A), { success: false, delivery: 'unknown' });
        expect(router.mirror()).toBeUndefined();
    });

    it('keeps retry ownership without a new input but never restores it after reset or a completed run', () => {
        const router = new ConversationRouter();
        router.startRun();
        const input = consume(router, A);
        router.freeze();
        router.endRun(true);
        router.startRun();
        router.freeze();
        expect(router.snapshot()?.target).toBe(A);
        router.endRun(false);
        router.startRun();
        router.freeze();
        expect(router.snapshot()?.target).toBeUndefined();
        router.reset();
        router.consume({ role: 'user', content: [{ type: 'text', text: input.content }] });
        router.freeze();
        expect(router.snapshot()?.target).toBeUndefined();
    });

    it('keeps suppression valid when a verified alias changes after the send', () => {
        let mapped = false;
        const lid = '999999@lid';
        const router = new ConversationRouter(jid => mapped && jid === lid ? A : jid);
        router.startRun();
        consume(router, lid);
        router.freeze();
        router.finishSend(router.beginSend(router.snapshot(), lid), { success: true });
        mapped = true;
        router.buffer({ role: 'assistant', content: [{ type: 'text', text: 'duplicate' }] });
        expect(router.mirror()).toBeUndefined();
    });

    it('does not lose a successful concurrent send when another call fails', () => {
        const router = new ConversationRouter();
        consume(router, A);
        router.freeze();
        const first = router.beginSend(router.snapshot(), A);
        const second = router.beginSend(router.snapshot(), A);
        router.finishSend(first, { success: true });
        router.finishSend(second, { success: false });
        router.buffer({ role: 'assistant', content: [{ type: 'text', text: 'duplicate' }] });
        expect(router.mirror()).toBeUndefined();
    });

    it('does not correlate changed image bytes to the original submitted request', () => {
        const router = new ConversationRouter();
        const input = router.prepare([{ type: 'text', text: 'image' }, { type: 'image', mimeType: 'image/png', data: 'original' }], origin(A));
        const text = input.content.filter(block => block.type === 'text').map(block => block.text).join('\n');
        router.observeInput({ source: 'extension', text, images: [{ type: 'image', mimeType: 'image/png', data: 'original' }] });
        router.consume({ role: 'user', content: [{ type: 'text', text }, { type: 'image', mimeType: 'image/png', data: 'changed' }] });
        router.freeze();
        expect(router.snapshot()?.target).toBeUndefined();
    });

    it('rejects a terminal replay of a pending marker', () => {
        const router = new ConversationRouter();
        const input = router.prepare('hello', origin(A));
        router.observeInput({ source: 'rpc', text: input.content });
        router.consume({ role: 'user', content: [{ type: 'text', text: input.content }] });
        router.freeze();
        expect(router.snapshot()?.target).toBeUndefined();
    });
});
