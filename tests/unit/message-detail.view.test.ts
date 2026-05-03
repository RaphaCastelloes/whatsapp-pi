import { describe, expect, it, vi } from 'vitest';
import { MessageDetailView } from '../../src/ui/message-detail.view.js';

describe('MessageDetailView', () => {
    it('renders full message context and content', () => {
        const ansiPattern = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
        const view = new MessageDetailView({
            title: 'Message • Ana',
            messageId: 'MSG1',
            senderNumber: '+5511999998888',
            senderName: 'Ana',
            text: 'First line\nSecond line with emojis 🚀',
            direction: 'incoming',
            timestamp: new Date(2026, 3, 20, 10, 15, 30).getTime(),
            onClose: vi.fn(),
            onReply: vi.fn()
        });

        const output = view.render(80).join('\n').replace(ansiPattern, '');

        expect(output).toContain('╭');
        expect(output).toContain('╰');
        expect(output).not.toContain('Message • Ana');
        expect(output).toContain('Message ID: MSG1');
        expect(output).toContain('From: Ana (+5511999998888)');
        expect(output).toContain('Direction: Received');
        expect(output).toContain('First line');
        expect(output).toContain('Second');
        expect(output).toContain('line with');
        expect(output).toContain('emojis 🚀');
        expect(output).toContain('Press R to reply');
    });

    it('opens reply flow when the user presses R', () => {
        const onClose = vi.fn();
        const onReply = vi.fn();
        const view = new MessageDetailView({
            title: 'Message • Ana',
            messageId: 'MSG1',
            senderNumber: '+5511999998888',
            text: 'hello',
            direction: 'incoming',
            timestamp: Date.now(),
            onClose,
            onReply
        });

        view.handleInput('r');

        expect(onReply).toHaveBeenCalledOnce();
        expect(onClose).not.toHaveBeenCalled();
    });

    it('closes when the user presses Enter or Escape', () => {
        const onClose = vi.fn();
        const view = new MessageDetailView({
            title: 'Message • Ana',
            messageId: 'MSG1',
            senderNumber: '+5511999998888',
            text: 'hello',
            direction: 'incoming',
            timestamp: Date.now(),
            onClose
        });

        view.handleInput('escape');
        view.handleInput('enter');

        expect(onClose).toHaveBeenCalledTimes(2);
    });
});
