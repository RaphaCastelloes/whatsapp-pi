import { WhatsAppService } from './whatsapp.service.js';
import { MessageRequest, MessageResult, WhatsAppError } from '../models/whatsapp.types.js';

export class MessageSender {
    private whatsappService: WhatsAppService;

    constructor(whatsappService: WhatsAppService) {
        this.whatsappService = whatsappService;
    }

    /**
     * Pauses execution for the specified time.
     * @param ms Milliseconds to sleep.
     */
    private async sleep(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Waits for the WhatsApp connection to be active.
     * @param timeoutMs Maximum time to wait in milliseconds.
     * @throws {WhatsAppError} If connection is not established within timeout.
     */
    private async waitIfOffline(timeoutMs: number = 30000): Promise<void> {
        const start = Date.now();
        while (this.whatsappService.getStatus() !== 'connected') {
            if (Date.now() - start > timeoutMs) {
                throw new WhatsAppError('TIMEOUT', 'Timed out waiting for WhatsApp connection');
            }
            await this.sleep(1000);
        }
    }

    /**
     * Sends a message with retry logic and connection awareness.
     * @param request The message recipient and content.
     * @returns Promise resolving to a result object indicating success or failure.
     */
    public async send(request: MessageRequest): Promise<MessageResult> {
        const maxRetries = request.options?.maxRetries ?? 3;
        let attempts = 0;
        let lastError: unknown = null;

        while (attempts < maxRetries) {
            attempts++;
            try {
                // 1. Ensure we are online
                await this.waitIfOffline();
                
                // 2. Get active socket
                const socket = this.whatsappService.getSocket();
                if (!socket) {
                    throw new WhatsAppError('SOCKET_NOT_INIT', 'WhatsApp socket not initialized');
                }

                // 3. Send the message
                // Note: Branding π is applied here to ensure consistency
                const response = await socket.sendMessage(request.recipientJid, { 
                    text: `${request.text} π` 
                });

                return {
                    success: true,
                    messageId: response?.key?.id,
                    attempts
                };
            } catch (error: unknown) {
                lastError = error;
                console.error(`[MessageSender] Attempt ${attempts} failed for ${request.recipientJid}: ${error instanceof Error ? error.message : String(error)}`);
                
                // Specific handling for non-retryable errors
                if (error instanceof WhatsAppError && error.code === 'TIMEOUT') {
                    break;
                }

                // 4. Backoff before retry
                if (attempts < maxRetries) {
                    const backoff = Math.pow(2, attempts) * 1000;
                    if (this.whatsappService.isVerbose()) {
                        console.log(`[MessageSender] Retrying in ${backoff}ms...`);
                    }
                    await this.sleep(backoff);
                }
            }
        }

        return {
            success: false,
            error: lastError instanceof Error ? lastError.message : 'Unknown error',
            attempts
        };
    }
}
