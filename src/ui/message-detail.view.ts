import { matchesKey, truncateToWidth, wrapTextWithAnsi, visibleWidth } from '@mariozechner/pi-tui';
import type { MessageDirection } from '../models/whatsapp.types.js';

export interface MessageDetailViewProps {
    title: string;
    messageId: string;
    senderNumber: string;
    senderName?: string;
    text: string;
    direction: MessageDirection;
    timestamp: number;
    onClose: () => void;
}

export class MessageDetailView {
    constructor(private readonly props: MessageDetailViewProps) {}

    handleInput(data: string): void {
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
        const title = this.props.title.trim() || 'Message Details';
        const bodyText = this.props.text.length > 0 ? this.props.text : '[No readable text available]';

        const availableWidth = Math.max(20, width - 4);
        const rawHeaderLines = [
            `Message ID: ${this.props.messageId}`,
            `From: ${this.formatSender()}`,
            `Direction: ${this.formatDirection()} • Time: ${this.formatTimestamp(this.props.timestamp)}`
        ];

        const contentWidth = Math.min(
            availableWidth,
            Math.max(
                visibleWidth('Press Enter or Esc to return'),
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
        const exitHint = `\x1b[90mPress Enter or Esc to return\x1b[39m`;

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
        return this.props.direction === 'outgoing' ? 'Sent' : 'Received';
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
): Promise<void> {
    await ctx.ui.custom<void>(
        (_tui, _theme, _keybindings, done) => new MessageDetailView({
            ...props,
            onClose: () => done(undefined)
        }),
        { overlay: true }
    );
}
