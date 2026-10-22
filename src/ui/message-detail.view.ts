import { matchesKey, truncateToWidth, wrapTextWithAnsi, visibleWidth } from '@mariozechner/pi-tui';
import type { SelectedMessageContext } from '../models/whatsapp.types.js';
import { t } from '../i18n.js';

export interface MessageDetailViewProps extends SelectedMessageContext {
    title: string;
    onClose: () => void;
    onReply?: () => void | Promise<void>;
}

export class MessageDetailView {
    constructor(private readonly props: MessageDetailViewProps) {}

    handleInput(data: string): void {
        const normalized = data.toLowerCase();

        if (normalized === 'r' || matchesKey(data, 'r')) {
            if (this.props.quoteAvailable !== false) void this.props.onReply?.();
            return;
        }

        if (
            data === 'enter' ||
            data === 'return' ||
            data === 'escape' ||
            data === 'esc' ||
            matchesKey(data, 'enter') ||
            matchesKey(data, 'escape') ||
            matchesKey(data, 'backspace')
        ) {
            this.props.onClose();
        }
    }

    render(width: number): string[] {
        const original = this.props.text.length > 0 ? this.props.text : t('message.detail.noReadableText');
        const lifecycle = { status: this.props.status, sendState: this.props.sendState, editedAt: this.props.editedAt,
            deleted: this.props.deleted, receipts: this.props.receipts, reactions: this.props.reactions, incomplete: this.props.incomplete };
        const observed = Object.values(lifecycle).some(value => value !== undefined);
        const bodyText = observed ? `${original}\n\n${t('archive.lifecycle')}\n${JSON.stringify(lifecycle, null, 2)}` : original;

        const availableWidth = Math.max(20, width - 4);
        const rawHeaderLines = [
            ...(this.props.quoteAvailable === false ? [t('quote.unavailable')] : []),
            `${t('message.detail.messageId')}: ${this.props.messageId}`,
            `${t('message.detail.from')}: ${this.formatSender()}`,
            `${t('message.detail.direction')}: ${this.formatDirection()} • ${t('message.detail.time')}: ${this.formatTimestamp(this.props.timestamp)}`
        ];

        const contentWidth = Math.min(
            availableWidth,
            Math.max(
                visibleWidth(t('message.detail.hint.close')),
                ...rawHeaderLines.map(line => visibleWidth(line)),
                ...wrapTextWithAnsi(bodyText, availableWidth).map(line => visibleWidth(line))
            )
        );

        const wrapWidth = Math.max(1, contentWidth);
        const boxWidth = wrapWidth + 4;
        const padLine = (line: string) => `│ ${truncateToWidth(line, wrapWidth).padEnd(wrapWidth, ' ')} │`;
        const centerLine = (line: string) => {
            const content = truncateToWidth(line, wrapWidth);
            const visible = visibleWidth(content);
            const leftPadding = Math.max(0, Math.floor((wrapWidth - visible) / 2));
            const rightPadding = Math.max(0, wrapWidth - visible - leftPadding);
            return `│ ${' '.repeat(leftPadding)}${content}${' '.repeat(rightPadding)} │`;
        };
        const topBorder = `╭${'─'.repeat(boxWidth - 2)}╮`;
        const separator = `├${'─'.repeat(boxWidth - 2)}┤`;
        const bottomBorder = `╰${'─'.repeat(boxWidth - 2)}╯`;
        const bodyLines = wrapTextWithAnsi(bodyText, wrapWidth).filter(line => line.length > 0 || bodyText.length === 0);
        const exitHint = this.props.onReply && this.props.quoteAvailable !== false
            ? `\x1b[90m${t('message.detail.hint.replyOrClose')}\x1b[39m`
            : `\x1b[90m${t('message.detail.hint.close')}\x1b[39m`;

        return [
            topBorder,
            ...rawHeaderLines.map(padLine),
            separator,
            ...bodyLines.map(padLine),
            separator,
            centerLine(exitHint),
            bottomBorder
        ];
    }

    invalidate(): void {}

    private formatSender(): string {
        return this.props.senderName
            ? `${this.props.senderName} (${this.props.senderNumber})`
            : this.props.senderNumber;
    }

    private formatDirection(): string {
        return this.props.direction === 'outgoing' ? t('message.detail.direction.sent') : t('message.detail.direction.received');
    }

    private formatTimestamp(timestamp: number): string {
        return new Intl.DateTimeFormat(undefined, {
            dateStyle: 'short',
            timeStyle: 'medium'
        }).format(new Date(timestamp));
    }
}

export async function showMessageDetailView(
    ctx: {
        ui: {
            custom: <T>(factory: (_tui: unknown, _theme: unknown, _keybindings: unknown, done: (value: T | undefined) => void) => MessageDetailView, options?: { overlay?: boolean }) => Promise<T | undefined>;
        }
    },
    props: Omit<MessageDetailViewProps, 'onClose'>
): Promise<'reply' | undefined> {
    return await ctx.ui.custom<'reply' | undefined>(
        (_tui, _theme, _keybindings, done) => new MessageDetailView({
            ...props,
            onClose: () => done(undefined),
            onReply: props.quoteAvailable === false ? undefined : () => done('reply')
        }),
        { overlay: true }
    );
}
