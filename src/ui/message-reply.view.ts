import type { ReplyDraft, ReplySendResult, SelectedMessageContext, QuoteTarget } from '../models/whatsapp.types.js';
import { truncateToWidth } from '@mariozechner/pi-tui';
import type { WhatsAppService } from '../services/whatsapp.service.js';
import type { RecentsService } from '../services/recents.service.js';
import { t } from '../i18n.js';

export interface MessageReplyViewProps {
    selectedMessage: SelectedMessageContext;
    whatsappService: WhatsAppService;
    recentsService: RecentsService;
}

interface MessageReplyContextUi {
    editor(title: string, prefilled?: string): Promise<string | undefined>;
    notify(message: string, level: 'info' | 'warning' | 'error'): void;
    setWidget(name: string, widget?: string[] | ((tui: unknown, theme: { fg: (tone: string, text: string) => string }) => { render(width: number): string[]; invalidate(): void }) , options?: { placement?: 'belowEditor' }): void;
}

interface MessageReplyContext {
    ui: MessageReplyContextUi;
}

const buildPreview = (text: string): string => {
    const normalized = text.trim().replace(/\s+/g, ' ');
    if (!normalized) {
        return t('message.reply.noReadableText');
    }

    return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
};

const buildReplyWidget = (selectedMessage: SelectedMessageContext): string[] => {
    const sender = selectedMessage.senderName
        ? `${selectedMessage.senderName} (${selectedMessage.senderNumber})`
        : selectedMessage.senderNumber;

    return [
        `${t('message.reply.replyingTo')}: ${sender}`,
        `${t('message.reply.messageId')}: ${selectedMessage.messageId}`,
        `${t('message.reply.original')}: ${buildPreview(selectedMessage.text)}`
    ];
};

const buildReplyTitle = (selectedMessage: SelectedMessageContext): string => {
    const sender = selectedMessage.senderName
        ? `${selectedMessage.senderName} (${selectedMessage.senderNumber})`
        : selectedMessage.senderNumber;

    return truncateToWidth(`${t('message.reply.title')} ${sender}`, 120);
};

export async function showMessageReplyView(
    ctx: MessageReplyContext,
    props: MessageReplyViewProps
): Promise<void> {
    const sessionContext = props.whatsappService.getSessionContext();
    const quote: QuoteTarget = {
        messageId: props.selectedMessage.messageId, conversationJid: props.selectedMessage.senderNumber,
        scope: props.selectedMessage.historyScope, participant: props.selectedMessage.key?.participant ?? undefined,
        fromMe: props.selectedMessage.direction === 'outgoing'
    };
    const original = props.whatsappService.getQuotedMessage(props.selectedMessage.senderNumber, quote);
    if (props.selectedMessage.quoteAvailable === false || !original?.key.remoteJid) {
        ctx.ui.notify(t('quote.unavailable'), 'error');
        return;
    }
    const recipientJid = original.key.remoteJid;
    const widgetName = 'message-reply-context';
    ctx.ui.setWidget(widgetName, buildReplyWidget(props.selectedMessage), { placement: 'belowEditor' });

    try {
        while (true) {
            const replyText = await ctx.ui.editor(buildReplyTitle(props.selectedMessage));

            if (replyText === undefined) {
                return;
            }

            const text = replyText.trim();
            if (!text) {
                ctx.ui.notify(t('message.reply.emptyMessage'), 'error');
                continue;
            }

            if (!props.whatsappService.isSessionContextCurrent(sessionContext)) {
                ctx.ui.notify(t('message.sender.sessionChanged'), 'error');
                return;
            }
            const draft: ReplyDraft = {
                text,
                targetMessageId: props.selectedMessage.messageId,
                targetConversation: props.selectedMessage.senderNumber
            };
            const result: ReplySendResult = await props.whatsappService.sendMenuMessage(
                recipientJid,
                draft.text,
                quote
            );

            if (result.success) {
                await props.recentsService.recordMessage({
                    messageId: result.messageId ?? `${Date.now()}`,
                    senderNumber: props.selectedMessage.senderNumber,
                    senderName: props.selectedMessage.senderName,
                    text: draft.text,
                    quotedMessageId: quote.messageId,
                    direction: 'outgoing',
                    timestamp: Date.now()
                });
                ctx.ui.notify(t('message.reply.sent', { preview: buildPreview(props.selectedMessage.text) }), 'info');
            } else {
                ctx.ui.notify(
                    t('message.reply.failed', { error: result.error ?? t('message.reply.unknownError') }),
                    'error'
                );
            }

            return;
        }
    } finally {
        ctx.ui.setWidget(widgetName, undefined);
    }
}
