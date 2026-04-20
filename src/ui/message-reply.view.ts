import type { ReplyDraft, ReplySendResult, SelectedMessageContext } from '../models/whatsapp.types.js';
import { truncateToWidth } from '@mariozechner/pi-tui';
import type { WhatsAppService } from '../services/whatsapp.service.js';
import type { RecentsService } from '../services/recents.service.js';

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
        return '[No readable text available]';
    }

    return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
};

const buildReplyWidget = (selectedMessage: SelectedMessageContext): string[] => {
    const sender = selectedMessage.senderName
        ? `${selectedMessage.senderName} (${selectedMessage.senderNumber})`
        : selectedMessage.senderNumber;

    return [
        `Replying to: ${sender}`,
        `Message ID: ${selectedMessage.messageId}`,
        `Original: ${buildPreview(selectedMessage.text)}`
    ];
};

const buildReplyTitle = (selectedMessage: SelectedMessageContext): string => {
    const sender = selectedMessage.senderName
        ? `${selectedMessage.senderName} (${selectedMessage.senderNumber})`
        : selectedMessage.senderNumber;

    return truncateToWidth(`Reply to ${sender}`, 120);
};

export async function showMessageReplyView(
    ctx: MessageReplyContext,
    props: MessageReplyViewProps
): Promise<void> {
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
                ctx.ui.notify('Please enter a message before sending.', 'error');
                continue;
            }

            const draft: ReplyDraft = {
                text,
                targetMessageId: props.selectedMessage.messageId,
                targetConversation: props.selectedMessage.senderNumber
            };

            const result: ReplySendResult = await props.whatsappService.sendMenuMessage(
                props.selectedMessage.senderNumber,
                draft.text
            );

            if (result.success) {
                await props.recentsService.recordMessage({
                    messageId: result.messageId ?? `${Date.now()}`,
                    senderNumber: props.selectedMessage.senderNumber,
                    senderName: props.selectedMessage.senderName,
                    text: draft.text,
                    direction: 'outgoing',
                    timestamp: Date.now()
                });
                ctx.ui.notify(`Sent reply to ${buildPreview(props.selectedMessage.text)}`, 'info');
            } else {
                ctx.ui.notify(
                    `Failed to send reply: ${result.error ?? 'Unknown error'}`,
                    'error'
                );
            }

            return;
        }
    } finally {
        ctx.ui.setWidget(widgetName, undefined);
    }
}
