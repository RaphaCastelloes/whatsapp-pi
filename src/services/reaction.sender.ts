import { t } from '../i18n.js';
import type { WAMessageKey } from 'baileys';

export interface SendReactionOptions {
    jid: string;
    messageId: string;
    emoji: string;
    key?: WAMessageKey;
    fromMe?: boolean;
    participant?: string;
}

export interface SendReactionResult {
    success: boolean;
    messageId?: string;
    error?: string;
    delivery?: 'unknown';
}

// Socket interface that matches what we need from Baileys
interface ReactionSocket {
    sendMessage: (jid: string, content: { react: { text: string; key: WAMessageKey } }) => Promise<{ key?: { id?: string | null } } | undefined>;
}

export class ReactionSender {
    constructor(
        private socket: ReactionSocket | null,
        private readonly resolveTarget?: (options: SendReactionOptions) => WAMessageKey | undefined
    ) {}

    async sendReaction(options: SendReactionOptions): Promise<SendReactionResult> {
        if (!this.socket) {
            return { success: false, error: t('service.whatsapp.notConnected') };
        }

        // Validate emoji (must be single emoji or empty string to remove)
        if (!this.isValidEmoji(options.emoji)) {
            return { success: false, error: t('tool.sendReaction.error.invalidEmoji') };
        }

        const key = options.key ?? this.resolveTarget?.(options) ?? (!this.resolveTarget ? {
            remoteJid: options.jid, id: options.messageId,
            fromMe: options.fromMe ?? false, participant: options.participant
        } : undefined);
        if (!key?.remoteJid || key.id !== options.messageId || key.fromMe == null
            || (key.remoteJid.endsWith('@g.us') && !key.participant)) {
            return { success: false, error: t('message.targetUnavailable') };
        }

        try {
            const result = await this.socket.sendMessage(key.remoteJid, {
                react: {
                    text: options.emoji,
                    key: { ...key }
                }
            });

            if (!result?.key?.id) {
                return { success: false, delivery: 'unknown', error: t('message.sender.deliveryUnknown') };
            }
            return { success: true, messageId: result.key.id };
        } catch (error) {
            return {
                success: false,
                delivery: 'unknown',
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    private isValidEmoji(emoji: string): boolean {
        // Allow empty string (removes reaction)
        if (emoji === '') return true;
        const segments = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(emoji)];
        return segments.length === 1
            && /[\p{Extended_Pictographic}\p{Regional_Indicator}\u20E3]/u.test(emoji)
            && /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|\u200D|\uFE0F|\u20E3|[#*0-9]|[\u{E0020}-\u{E007F}])+$/u.test(emoji);
    }
}
