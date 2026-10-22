import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetI18n } from '../../src/i18n.ts';
import { MessageSender } from '../../src/services/message.sender.ts';

describe('MessageSender', () => {
    const whatsappService = {
        getStatus: vi.fn(),
        getSocket: vi.fn(),
        getSessionContext: vi.fn().mockReturnValue({ accountScope: 'account', generation: 1 }),
        isSessionContextCurrent: vi.fn().mockReturnValue(true),
        isVerbose: vi.fn(),
        prepareGroupSession: vi.fn().mockResolvedValue(undefined),
        cacheSentMessage: vi.fn(),
        registerOutgoing: vi.fn(),
        recordSendOutcome: vi.fn()
    };

    beforeEach(() => {
        resetI18n();
        vi.clearAllMocks();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'log').mockImplementation(() => {});
        whatsappService.getStatus.mockReturnValue('connected');
        whatsappService.isVerbose.mockReturnValue(false);
        whatsappService.isSessionContextCurrent.mockReturnValue(true);
    });

    it('sends branded text through the active socket', async () => {
        const message = { extendedTextMessage: { text: 'hello π' } };
        const sendMessage = vi.fn().mockResolvedValue({ key: { id: 'MSG123' }, message });
        whatsappService.getSocket.mockReturnValue({ sendMessage });
        const sender = new MessageSender(whatsappService as any);

        await expect(sender.send({
            recipientJid: '5511999998888@s.whatsapp.net',
            text: 'hello'
        })).resolves.toEqual({
            success: true,
            messageId: 'MSG123',
            attempts: 1
        });

        expect(sendMessage).toHaveBeenCalledWith('5511999998888@s.whatsapp.net', {
            text: 'hello π'
        }, { messageId: expect.any(String) });
        expect(whatsappService.cacheSentMessage).toHaveBeenCalledWith('MSG123', message, {
            id: 'MSG123', remoteJid: '5511999998888@s.whatsapp.net', fromMe: true
        });
    });

    it('returns failure when no socket is available and retries are exhausted', async () => {
        vi.useFakeTimers();
        whatsappService.getSocket.mockReturnValue(undefined);
        const sender = new MessageSender(whatsappService as any);

        const resultPromise = sender.send({
            recipientJid: '5511999998888@s.whatsapp.net',
            text: 'hello',
            options: { maxRetries: 2 }
        });

        await vi.advanceTimersByTimeAsync(2000);
        await expect(resultPromise).resolves.toEqual({
            success: false,
            error: 'WhatsApp socket not initialized',
            attempts: 2
        });
        vi.useRealTimers();
    });

    it('reuses one message ID across definitely pre-transmission retries', async () => {
        vi.useFakeTimers();
        try {
            const sendMessage = vi.fn()
                .mockRejectedValueOnce(new Error('No sessions'))
                .mockResolvedValueOnce({ key: { id: 'sent' }, message: { conversation: 'hello π' } });
            whatsappService.getSocket.mockReturnValue({ sendMessage });
            const pending = new MessageSender(whatsappService as any).send({ recipientJid: '5511999998888@s.whatsapp.net', text: 'hello' });
            await vi.advanceTimersByTimeAsync(2_000);
            expect((await pending).success).toBe(true);
            expect(sendMessage).toHaveBeenCalledTimes(2);
            expect(sendMessage.mock.calls[0][2].messageId).toBe(sendMessage.mock.calls[1][2].messageId);
            expect(whatsappService.registerOutgoing.mock.invocationCallOrder[0]).toBeLessThan(whatsappService.cacheSentMessage.mock.invocationCallOrder[0]);
        } finally {
            vi.useRealTimers();
        }
    });

    it('returns unknown without blindly retrying after transport has started', async () => {
        const sendMessage = vi.fn().mockRejectedValue(new Error('Connection lost after write'));
        whatsappService.getSocket.mockReturnValue({ sendMessage });
        const sender = new MessageSender(whatsappService as any);
        const result = await sender.send({ recipientJid: '5511999998888@s.whatsapp.net', text: 'hello' });
        expect(result).toMatchObject({ success: false, delivery: 'unknown', attempts: 1 });
        expect(result.messageId).toEqual(expect.any(String));
        expect(sendMessage).toHaveBeenCalledOnce();
    });

    it('does not transmit or retry if the account changes during group preparation', async () => {
        const sendMessage = vi.fn();
        whatsappService.getSocket.mockReturnValue({ sendMessage });
        whatsappService.prepareGroupSession.mockImplementationOnce(async () => {
            whatsappService.isSessionContextCurrent.mockReturnValue(false);
        });
        const result = await new MessageSender(whatsappService as any).send({ recipientJid: '120363012345@g.us', text: 'old account' });
        expect(result).toMatchObject({ success: false, attempts: 1 });
        expect(result.delivery).toBeUndefined();
        expect(sendMessage).not.toHaveBeenCalled();
        expect(whatsappService.registerOutgoing).not.toHaveBeenCalled();
    });

    it('never caches an old-account send response into the new account', async () => {
        const sendMessage = vi.fn(async () => {
            whatsappService.isSessionContextCurrent.mockReturnValue(false);
            return { key: { id: 'old-send' }, message: { conversation: 'old account' } };
        });
        whatsappService.getSocket.mockReturnValue({ sendMessage });
        const result = await new MessageSender(whatsappService as any).send({ recipientJid: '15550000001@s.whatsapp.net', text: 'old account' });
        expect(result).toMatchObject({ success: false, delivery: 'unknown', attempts: 1 });
        expect(whatsappService.cacheSentMessage).not.toHaveBeenCalled();
        expect(sendMessage).toHaveBeenCalledOnce();
    });

    it('does not report an undefined socket response as accepted', async () => {
        whatsappService.getSocket.mockReturnValue({ sendMessage: vi.fn().mockResolvedValue(undefined) });
        const result = await new MessageSender(whatsappService as any).send({ recipientJid: '5511999998888@s.whatsapp.net', text: 'hello' });
        expect(result).toMatchObject({ success: false, delivery: 'unknown', attempts: 1 });
    });

    it('pre-send abort makes no socket call and settles owned resources once', async () => {
        const abort = new AbortController();
        abort.abort();
        const onSettled = vi.fn();
        const sendMessage = vi.fn();
        whatsappService.getSocket.mockReturnValue({ sendMessage });
        const result = await new MessageSender(whatsappService as any).send({ recipientJid: '15550000001@s.whatsapp.net', text: 'test', signal: abort.signal, onSettled });
        expect(result.success).toBe(false);
        expect(result.delivery).toBeUndefined();
        expect(sendMessage).not.toHaveBeenCalled();
        await vi.waitFor(() => expect(onSettled).toHaveBeenCalledOnce());
    });

    it('returns unknown on in-flight abort but waits for transport before settling resources', async () => {
        let complete!: (response: { key: { id: string }; message: { conversation: string } }) => void;
        let started!: () => void;
        const began = new Promise<void>(resolve => { started = resolve; });
        const sendMessage = vi.fn(() => { started(); return new Promise(resolve => { complete = resolve; }); });
        whatsappService.getSocket.mockReturnValue({ sendMessage });
        const abort = new AbortController();
        const onSettled = vi.fn();
        const pending = new MessageSender(whatsappService as any).send({ recipientJid: '15550000001@s.whatsapp.net', text: 'test', signal: abort.signal, onSettled });
        await began;
        abort.abort();
        expect(await pending).toMatchObject({ success: false, delivery: 'unknown', messageId: expect.any(String) });
        expect(onSettled).not.toHaveBeenCalled();
        complete({ key: { id: 'accepted' }, message: { conversation: 'test π' } });
        await vi.waitFor(() => expect(onSettled).toHaveBeenCalledWith(expect.objectContaining({ success: true, messageId: 'accepted' })));
        expect(sendMessage).toHaveBeenCalledOnce();
    });

    it('times out caller waiting during upload without releasing resources or retrying a possibly sent message', async () => {
        vi.useFakeTimers();
        try {
            let finish!: (response: { key: { id: string }; message: { conversation: string } }) => void;
            const sendMessage = vi.fn(() => new Promise(resolve => { finish = resolve; }));
            whatsappService.getSocket.mockReturnValue({ sendMessage });
            const onSettled = vi.fn();
            const pending = new MessageSender(whatsappService as any).send({ recipientJid: '15550000001@s.whatsapp.net', text: 'test', sendTimeoutMs: 20, onSettled });
            await vi.advanceTimersByTimeAsync(21);
            expect(await pending).toMatchObject({ success: false, delivery: 'unknown' });
            expect(onSettled).not.toHaveBeenCalled();
            finish({ key: { id: 'late' }, message: { conversation: 'test π' } });
            await vi.advanceTimersByTimeAsync(0);
            expect(onSettled).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
            expect(sendMessage).toHaveBeenCalledOnce();
        } finally { vi.useRealTimers(); }
    });

    it('logs retry delay when send fails', async () => {
        vi.useFakeTimers();
        whatsappService.getSocket.mockReturnValue(undefined);
        whatsappService.isVerbose.mockReturnValue(true);
        const sender = new MessageSender(whatsappService as any);

        const resultPromise = sender.send({
            recipientJid: '5511999998888@s.whatsapp.net',
            text: 'hello',
            options: { maxRetries: 2 }
        });

        await vi.advanceTimersByTimeAsync(2000);
        await resultPromise;

        expect(console.log).toHaveBeenCalledWith('[MessageSender] Retrying in 2000ms...');
        vi.useRealTimers();
    });
});
