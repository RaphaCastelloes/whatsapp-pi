import { WhatsAppService } from './whatsapp.service.js';
import { MessageRequest, MessageResult, WhatsAppError } from '../models/whatsapp.types.js';
import { appendFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const LOG_FILE = join(homedir(), '.pi', 'whatsapp-pi', 'whatsapp-pi.log');
function fileLog(msg: string) {
    try { appendFileSync(LOG_FILE, `[${new Date().toISOString()}] [MessageSender] ${msg}\n`); } catch {}
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
        const isGroup = request.recipientJid.endsWith('@g.us');
        // Groups need more retries because the first send bootstraps
        // the Signal sender-key session (causes "No sessions" on first attempts)
        const maxRetries = isGroup ? 5 : (request.options?.maxRetries ?? 3);
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

                // 3. Pre-load group metadata on first attempt
                if (isGroup && attempts === 1) {
                    await this.whatsappService.prepareGroupSession(request.recipientJid);
                }

                // 4. Send the message
                // Note: Branding π is applied here to ensure consistency
                const response = await socket.sendMessage(request.recipientJid, { 
                    text: `${request.text} π` 
                });

                fileLog(`SUCCESS sending to ${request.recipientJid} on attempt ${attempts}`);
                return {
                    success: true,
                    messageId: response?.key?.id,
                    attempts
                };
            } catch (error: unknown) {
                lastError = error;
                const errorMsg = error instanceof Error ? error.message : String(error);
                fileLog(`Attempt ${attempts}/${maxRetries} FAILED for ${request.recipientJid}: ${errorMsg}`);
                console.error(`[MessageSender] Attempt ${attempts} failed for ${request.recipientJid}: ${errorMsg}`);
                
                // Specific handling for non-retryable errors
                if (error instanceof WhatsAppError && error.code === 'TIMEOUT') {
                    break;
                }

                // 5. Backoff before retry
                if (attempts < maxRetries) {
                    // "No sessions" in groups needs much longer waits —
                    // Baileys syncs sender-keys in the background between retries
                    const isNoSessions = errorMsg.includes('No sessions');
                    const baseBackoff = (isGroup && isNoSessions) ? 5000 : 1000;
                    const backoff = Math.pow(2, attempts) * baseBackoff;
                    fileLog(`Retrying in ${backoff / 1000}s...`);
                    console.log(`[MessageSender] Retrying in ${backoff / 1000}s...`);
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
