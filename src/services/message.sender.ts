import { WhatsAppService } from './whatsapp.service.js';
import { MessageRequest, MessageResult, WhatsAppError, type WhatsAppSessionContext } from '../models/whatsapp.types.js';
import { t } from '../i18n.js';
import { appendFileSync } from 'fs';
import { createStoragePaths } from './storage-path.js';
import { generateMessageIDV2 } from 'baileys';

const LOG_FILE = createStoragePaths().logPath;
function fileLog(msg: string) {
    try { appendFileSync(LOG_FILE, `[${new Date().toISOString()}] [MessageSender] ${msg}\n`); } catch {
        // File logging is best-effort.
    }
}

export class MessageSender {
    private whatsappService: WhatsAppService;

    constructor(whatsappService: WhatsAppService) {
        this.whatsappService = whatsappService;
    }

    /**
     * Pauses execution for the specified time.
     * @param ms Milliseconds to sleep.
     */
    private async sleep(ms: number, signal?: AbortSignal): Promise<void> {
        if (signal?.aborted) throw new WhatsAppError('ABORTED', t('media.aborted'));
        return new Promise((resolve, reject) => {
            const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(new WhatsAppError('ABORTED', t('media.aborted'))); };
            const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
            signal?.addEventListener('abort', abort, { once: true });
        });
    }

    /**
     * Waits for the WhatsApp connection to be active.
     * @param timeoutMs Maximum time to wait in milliseconds.
     * @throws {WhatsAppError} If connection is not established within timeout.
     */
    private assertCurrentSession(context: WhatsAppSessionContext): void {
        if (!this.whatsappService.isSessionContextCurrent(context)) {
            throw new WhatsAppError('SESSION_CHANGED', t('message.sender.sessionChanged'));
        }
    }

    private async waitIfOffline(context: WhatsAppSessionContext, signal?: AbortSignal, timeoutMs: number = 30000): Promise<void> {
        const start = Date.now();
        while (this.whatsappService.getStatus() !== 'connected') {
            this.assertCurrentSession(context);
            if (Date.now() - start > timeoutMs) {
                throw new WhatsAppError('TIMEOUT', t('message.sender.timeout'));
            }
            await this.sleep(1000, signal);
        }
    }

    /**
     * Sends a message with retry logic and connection awareness.
     * @param request The message recipient and content.
     * @returns Promise resolving to a result object indicating success or failure.
     */
    public async send(request: MessageRequest): Promise<MessageResult> {
        await this.whatsappService.prepareArchive?.();
        const context = request.sessionContext ?? this.whatsappService.getSessionContext();
        const messageId = request.sendOptions?.messageId ?? generateMessageIDV2();
        const abort = new AbortController();
        let started = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let interrupt!: (result: MessageResult) => void;
        const interrupted = new Promise<MessageResult>(resolve => { interrupt = resolve; });
        const cancel = () => {
            abort.abort();
            const result: MessageResult = started
                ? { success: false, delivery: 'unknown', messageId, error: t('message.sender.deliveryUnknown'), attempts: 1 }
                : { success: false, error: t('media.aborted'), attempts: 0 };
            if (started && this.whatsappService.isSessionContextCurrent(context)) this.whatsappService.recordSendOutcome(request.recipientJid, messageId, result);
            interrupt(result);
        };
        request.signal?.addEventListener('abort', cancel, { once: true });
        if (request.signal?.aborted) cancel();
        const work = this.sendAttempt({ ...request, sessionContext: context, signal: abort.signal, sendOptions: { ...request.sendOptions, messageId } }, () => {
            started = true;
            if (request.sendTimeoutMs && !timer) timer = setTimeout(cancel, request.sendTimeoutMs);
        }).catch((error: unknown): MessageResult => ({
            success: false, ...(started ? { delivery: 'unknown' as const, messageId } : {}),
            error: error instanceof Error ? error.message : t('message.sender.unknownError'), attempts: started ? 1 : 0
        }));
        const settled = work.then(async result => {
            request.signal?.removeEventListener('abort', cancel);
            if (timer) clearTimeout(timer);
            if (this.whatsappService.isSessionContextCurrent(context)) this.whatsappService.recordSendOutcome(request.recipientJid, messageId, result);
            try {
                await request.onSettled?.(result);
            } catch {
                console.error(t('media.finalizeFailed'));
            }
            return result;
        });
        try {
            return await Promise.race([settled, interrupted]);
        } finally {
            request.signal?.removeEventListener('abort', cancel);
            if (timer) clearTimeout(timer);
        }
    }

    private async sendAttempt(request: MessageRequest, onStarted: () => void): Promise<MessageResult> {
        const context = request.sessionContext ?? this.whatsappService.getSessionContext();
        const isGroup = request.recipientJid.endsWith('@g.us');
        // Groups need more retries because the first send bootstraps
        // the Signal sender-key session (causes "No sessions" on first attempts)
        const maxRetries = request.options?.maxRetries ?? (isGroup ? 5 : 3);
        const messageId = request.sendOptions?.messageId ?? generateMessageIDV2();
        const content = request.content ?? { text: request.options?.brand === false ? request.text : `${request.text} π` };
        let attempts = 0;
        let lastError: unknown = null;

        while (attempts < maxRetries) {
            attempts++;
            let transmissionStarted = false;
            try {
                if (request.signal?.aborted) throw new WhatsAppError('ABORTED', t('media.aborted'));
                // 1. Ensure we are online
                this.assertCurrentSession(context);
                await this.waitIfOffline(context, request.signal);
                this.assertCurrentSession(context);
                
                // 2. Get active socket
                const socket = this.whatsappService.getSocket();
                if (!socket) {
                    throw new WhatsAppError('SOCKET_NOT_INIT', t('message.sender.socketNotInitialized'));
                }

                // 3. Pre-load group metadata before sending
                if (isGroup) {
                    await this.whatsappService.prepareGroupSession(request.recipientJid);
                }

                this.assertCurrentSession(context);
                if (socket !== this.whatsappService.getSocket()) {
                    throw new WhatsAppError('SOCKET_NOT_INIT', t('message.sender.socketNotInitialized'));
                }

                if (request.signal?.aborted) throw new WhatsAppError('ABORTED', t('media.aborted'));
                let quoted = request.quote ? this.whatsappService.getQuotedMessage(request.recipientJid, request.quote) : undefined;
                if (request.quote && !quoted) throw new WhatsAppError('QUOTE_UNAVAILABLE', t('quote.unavailable'));
                // 4. Send the message
                // Note: Branding π is applied here to ensure consistency
                this.whatsappService.registerOutgoing(request.recipientJid, messageId, content);
                await this.whatsappService.flushArchive?.();
                this.assertCurrentSession(context);
                if (request.signal?.aborted) throw new WhatsAppError('ABORTED', t('media.aborted'));
                if (socket !== this.whatsappService.getSocket()) throw new WhatsAppError('SOCKET_NOT_INIT', t('message.sender.socketNotInitialized'));
                quoted = request.quote ? this.whatsappService.getQuotedMessage(request.recipientJid, request.quote) : undefined;
                if (request.quote && !quoted) throw new WhatsAppError('QUOTE_UNAVAILABLE', t('quote.unavailable'));
                transmissionStarted = true;
                onStarted();
                const response = await socket.sendMessage(request.recipientJid, content, { ...request.sendOptions, ...(quoted ? { quoted } : {}), messageId });
                if (!this.whatsappService.isSessionContextCurrent(context) || !response?.key?.id) {
                    return { success: false, delivery: 'unknown', messageId, error: t('message.sender.deliveryUnknown'), attempts };
                }
                this.whatsappService.cacheSentMessage(response.key.id, response.message, {
                    ...response.key, remoteJid: request.recipientJid, fromMe: true,
                    ...(isGroup ? { participant: response.key.participant ?? response.participant } : {})
                });

                fileLog(`SUCCESS sending to ${request.recipientJid} on attempt ${attempts}`);
                return {
                    success: true,
                    messageId: response?.key?.id,
                    attempts
                };
            } catch (error: unknown) {
                lastError = error;
                console.error(t('message.sender.attemptFailed', {
                    attempt: attempts,
                    recipientJid: request.recipientJid,
                    error: error instanceof Error ? error.message : String(error)
                }));
                
                const message = error instanceof Error ? error.message : String(error);
                const statusCode = (error as { output?: { statusCode?: number } } | null)?.output?.statusCode;
                const nonRetryable = statusCode === 400 || statusCode === 401 || statusCode === 403;
                if (transmissionStarted && !message.includes('No sessions') && !nonRetryable) {
                    return { success: false, delivery: 'unknown', messageId, error: message, attempts };
                }
                if (request.signal?.aborted || nonRetryable || (error instanceof WhatsAppError && (error.code === 'TIMEOUT' || error.code === 'SESSION_CHANGED' || error.code === 'ABORTED' || error.code === 'QUOTE_UNAVAILABLE'))) break;

                // 5. Backoff before retry
                if (attempts < maxRetries) {
                    const message = error instanceof Error ? error.message : String(error);
                    const isNoSessions = message.includes('No sessions');
                    const backoff = isGroup && isNoSessions ? 5000 : 1000;
                    const delay = Math.pow(2, attempts) * backoff;

                    if (this.whatsappService.isVerbose()) {
                        console.log(t('message.sender.retrying', { backoff: delay }));
                    }
                    await this.sleep(delay, request.signal);
                }
            }
        }

        return {
            success: false,
            error: lastError instanceof Error ? lastError.message : t('message.sender.unknownError'),
            attempts
        };
    }
}
