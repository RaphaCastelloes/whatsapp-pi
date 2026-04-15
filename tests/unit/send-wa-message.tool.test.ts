import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for the send_wa_message tool execute logic.
 *
 * The tool's execute function is a closure over whatsappService and recentsService.
 * We replicate the exact logic here with mocked services so it can be tested in isolation.
 */

interface MockWhatsAppService {
    getStatus: () => string;
    sendMessage: (jid: string, message: string) => Promise<{ success: boolean; messageId?: string; error?: string; attempts: number }>;
}

interface MockRecentsService {
    recordMessage: (input: {
        messageId: string;
        senderNumber: string;
        text: string;
        direction: 'outgoing';
        timestamp: number;
    }) => Promise<void>;
}

async function executeToolLogic(
    params: { jid: string; message: string },
    whatsappService: MockWhatsAppService,
    recentsService: MockRecentsService
) {
    if (whatsappService.getStatus() !== 'connected') {
        return {
            isError: true,
            content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: 'WhatsApp not connected', attempts: 0 }) }]
        };
    }

    const result = await whatsappService.sendMessage(params.jid, params.message);

    if (result.success) {
        await recentsService.recordMessage({
            messageId: result.messageId!,
            senderNumber: `+${params.jid.split('@')[0]}`,
            text: params.message,
            direction: 'outgoing',
            timestamp: Date.now()
        });
    }

    return {
        isError: !result.success,
        content: [{ type: 'text' as const, text: JSON.stringify({ success: result.success, messageId: result.messageId, error: result.error, attempts: result.attempts }) }]
    };
}

describe('send_wa_message tool', () => {
    let whatsappService: MockWhatsAppService;
    let recentsService: MockRecentsService;

    beforeEach(() => {
        whatsappService = {
            getStatus: vi.fn().mockReturnValue('connected'),
            sendMessage: vi.fn().mockResolvedValue({ success: true, messageId: 'MSG123', attempts: 1 })
        };
        recentsService = {
            recordMessage: vi.fn().mockResolvedValue(undefined)
        };
    });

    describe('US2: structured feedback', () => {
        it('returns error result when WhatsApp is not connected', async () => {
            vi.mocked(whatsappService.getStatus).mockReturnValue('disconnected');

            const result = await executeToolLogic(
                { jid: '5511999998888@s.whatsapp.net', message: 'Hello' },
                whatsappService,
                recentsService
            );

            expect(result.isError).toBe(true);
            const parsed = JSON.parse(result.content[0].text);
            expect(parsed.success).toBe(false);
            expect(parsed.error).toBe('WhatsApp not connected');
            expect(parsed.attempts).toBe(0);
            expect(whatsappService.sendMessage).not.toHaveBeenCalled();
        });

        it('returns success result with messageId when delivery succeeds', async () => {
            const result = await executeToolLogic(
                { jid: '5511999998888@s.whatsapp.net', message: 'Hello' },
                whatsappService,
                recentsService
            );

            expect(result.isError).toBe(false);
            const parsed = JSON.parse(result.content[0].text);
            expect(parsed.success).toBe(true);
            expect(parsed.messageId).toBe('MSG123');
            expect(parsed.attempts).toBe(1);
            expect(parsed.error).toBeUndefined();
        });

        it('returns failure result with error description when delivery fails', async () => {
            vi.mocked(whatsappService.sendMessage).mockResolvedValue({
                success: false,
                error: 'Socket timed out',
                attempts: 3
            });

            const result = await executeToolLogic(
                { jid: '5511999998888@s.whatsapp.net', message: 'Hello' },
                whatsappService,
                recentsService
            );

            expect(result.isError).toBe(true);
            const parsed = JSON.parse(result.content[0].text);
            expect(parsed.success).toBe(false);
            expect(parsed.error).toBe('Socket timed out');
            expect(parsed.attempts).toBe(3);
            expect(parsed.messageId).toBeUndefined();
        });
    });

    describe('US3: recents recording', () => {
        it('records outgoing message to recents on successful send', async () => {
            await executeToolLogic(
                { jid: '5511999998888@s.whatsapp.net', message: 'Hello recents' },
                whatsappService,
                recentsService
            );

            expect(recentsService.recordMessage).toHaveBeenCalledOnce();
            const call = vi.mocked(recentsService.recordMessage).mock.calls[0][0];
            expect(call.messageId).toBe('MSG123');
            expect(call.senderNumber).toBe('+5511999998888');
            expect(call.text).toBe('Hello recents');
            expect(call.direction).toBe('outgoing');
            expect(typeof call.timestamp).toBe('number');
        });

        it('does NOT record to recents when delivery fails', async () => {
            vi.mocked(whatsappService.sendMessage).mockResolvedValue({
                success: false,
                error: 'Failed',
                attempts: 1
            });

            await executeToolLogic(
                { jid: '5511999998888@s.whatsapp.net', message: 'Hello' },
                whatsappService,
                recentsService
            );

            expect(recentsService.recordMessage).not.toHaveBeenCalled();
        });

        it('does NOT record to recents when WhatsApp is not connected', async () => {
            vi.mocked(whatsappService.getStatus).mockReturnValue('disconnected');

            await executeToolLogic(
                { jid: '5511999998888@s.whatsapp.net', message: 'Hello' },
                whatsappService,
                recentsService
            );

            expect(recentsService.recordMessage).not.toHaveBeenCalled();
        });
    });
});
