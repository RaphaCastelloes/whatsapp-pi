import { WhatsAppService } from '../services/whatsapp.service.js';
import { SessionManager, type Contact } from '../services/session.manager.js';
import { validatePhoneNumber, type RecentConversationMessage, type RecentConversationSummary } from '../models/whatsapp.types.js';
import { RecentsService } from '../services/recents.service.js';
import { showMessageDetailView } from './message-detail.view.js';
import { showMessageReplyView } from './message-reply.view.js';
import * as qrcode from 'qrcode-terminal';
import type { ExtensionCommandContext } from '@mariozechner/pi-coding-agent';

interface HistoryOptionEntry {
    label: string;
    message: RecentConversationMessage;
}

export class MenuHandler {
    private readonly printedAllowedNumbers: string[] = [];

    constructor(
        private readonly whatsappService: WhatsAppService,
        private readonly sessionManager: SessionManager,
        private readonly recentsService: RecentsService
    ) {}

    async handleCommand(ctx: ExtensionCommandContext) {
        const status = this.whatsappService.getEffectiveStatus();
        const registered = await this.sessionManager.isRegistered();
        const options: string[] = [];

        if (status === 'connected') {
            options.push('Recents');
            options.push('Allowed Numbers');
            options.push('Blocked Numbers');
            options.push('Disconnect WhatsApp');
        } else {
            options.push('Connect WhatsApp');
        }

        if (registered) {
            options.push('Logoff (Delete Session)');
        }

        options.push('Back');

        const choice = await ctx.ui.select(`WhatsApp (Status: ${status})`, options);

        switch (choice) {
            case 'Connect WhatsApp':
                if (status === 'connected') {
                    ctx.ui.notify('WhatsApp is already connected', 'info');
                    break;
                }
                this.whatsappService.setQRCodeCallback((qr) => {
                    qrcode.generate(qr, { small: true });
                });
                await this.whatsappService.start();
                ctx.ui.notify(registered ? 'WhatsApp Reconnect Started' : 'WhatsApp Pairing Started', 'info');
                break;
            case 'Disconnect WhatsApp':
                if (status !== 'connected') {
                    ctx.ui.notify('WhatsApp is already disconnected', 'info');
                    break;
                }
                await this.whatsappService.stop();
                ctx.ui.notify('WhatsApp Agent Disconnected', 'warning');
                break;
            case 'Logoff (Delete Session)': {
                const confirmLogoff = await ctx.ui.confirm('Logoff', 'Delete all credentials?');
                if (confirmLogoff) {
                    await this.whatsappService.logout();
                    ctx.ui.notify('Logged off and credentials deleted', 'info');
                }
                break;
            }
            case 'Allowed Numbers':
                await this.manageAllowList(ctx);
                break;
            case 'Blocked Numbers':
                await this.manageBlockList(ctx);
                break;
            case 'Recents':
                await this.manageRecents(ctx);
                break;
        }
    }

    private async manageAllowList(ctx: ExtensionCommandContext) {
        const list = this.sortContactsAlphabetically(this.sessionManager.getAllowList());
        const options = [...list.map(contact => this.formatAllowedContactOption(contact)), 'Add Number', 'Back'];

        const choice = await ctx.ui.select('Allowed Numbers', options);

        if (choice === 'Add Number') {
            const num = await ctx.ui.input('Enter number (e.g. +5511999999999):');
            if (num && validatePhoneNumber(num)) {
                await this.sessionManager.addNumber(num);
                ctx.ui.notify(`Added ${num}`, 'info');
            } else {
                ctx.ui.notify('Invalid number format', 'error');
            }
            await this.manageAllowList(ctx);
            return;
        }

        if (choice === 'Back' || !choice) {
            await this.handleCommand(ctx);
            return;
        }

        const selectedContact = list.find(contact => this.formatAllowedContactOption(contact) === choice);
        if (!selectedContact) {
            await this.manageAllowList(ctx);
            return;
        }

        await this.manageAllowedContact(ctx, selectedContact);
    }

    private async manageAllowedContact(ctx: ExtensionCommandContext, contact: Contact) {
        const displayName = this.formatAllowedContactOption(contact);
        const options = ['History', 'Send Message', 'Print Number'];
        if (contact.name) {
            options.push('Remove Alias');
        } else {
            options.push('Add Alias');
        }
        options.push('Remove Number', 'Back');

        const choice = await ctx.ui.select(`Allowed Number • ${displayName}`, options);

        if (choice === 'Send Message') {
            await this.sendMessageToAllowedNumber(ctx, contact);
            await this.manageAllowedContact(ctx, contact);
            return;
        }

        if (choice === 'History') {
            await this.showConversationHistoryForNumber(ctx, contact.number, displayName);
            await this.manageAllowedContact(ctx, contact);
            return;
        }

        if (choice === 'Print Number') {
            this.printAllowedNumber(ctx, contact.number);
            await this.manageAllowedContact(ctx, contact);
            return;
        }

        if (choice === 'Add Alias') {
            const alias = await ctx.ui.input(`Enter alias for ${contact.number}:`);
            const trimmedAlias = alias?.trim() || '';

            if (!trimmedAlias) {
                ctx.ui.notify('Please enter an alias.', 'error');
                await this.manageAllowedContact(ctx, contact);
                return;
            }

            await this.sessionManager.setAllowedContactAlias(contact.number, trimmedAlias);
            ctx.ui.notify(`Alias added for ${contact.number}`, 'info');
            await this.manageAllowedContact(ctx, { ...contact, name: trimmedAlias });
            return;
        }

        if (choice === 'Remove Alias') {
            await this.sessionManager.removeAllowedContactAlias(contact.number);
            ctx.ui.notify(`Alias removed for ${contact.number}`, 'info');
            await this.manageAllowedContact(ctx, { ...contact, name: undefined });
            return;
        }

        if (choice === 'Remove Number') {
            const ok = await ctx.ui.confirm('Remove Number', `Remove ${displayName} from Allowed Numbers?`);
            if (ok) {
                await this.sessionManager.removeNumber(contact.number);
                ctx.ui.notify(`Removed ${displayName}`, 'info');
            }
            await this.manageAllowList(ctx);
            return;
        }

        await this.manageAllowList(ctx);
    }

    private printAllowedNumber(ctx: ExtensionCommandContext, number: string) {
        this.printedAllowedNumbers.push(number);
        const output = this.printedAllowedNumbers
            .map((entry) => `  • ${entry}`)
            .join('\n');
        console.log([
            '[WhatsApp-Pi] Allowed numbers',
            output
        ].join('\n'));
        ctx.ui.notify(this.printedAllowedNumbers.join('\n'), 'info');
    }

    private async manageBlockList(ctx: ExtensionCommandContext) {
        const list = [...this.sessionManager.getBlockList()].reverse();

        if (list.length === 0) {
            ctx.ui.notify('No blocked numbers', 'info');
            await this.handleCommand(ctx);
            return;
        }

        const options = [...list.map(c => c.name ? `${c.name} (${c.number})` : c.number), 'Back'];
        const choice = await ctx.ui.select('Blocked Numbers (Select to Manage)', options);

        if (choice && choice !== 'Back') {
            await this.manageBlockedNumber(ctx, this.parseContactNumberOption(choice));
        } else {
            await this.handleCommand(ctx);
        }
    }

    private async manageBlockedNumber(ctx: ExtensionCommandContext, number: string) {
        const action = await ctx.ui.select(`Manage ${number}`, ['Allow', 'Delete', 'Back']);

        if (action === 'Allow') {
            const ok = await ctx.ui.confirm('Allow', `Move ${number} to Allowed Numbers?`);
            if (ok) {
                await this.sessionManager.unblockAndAllow(number);
                ctx.ui.notify(`${number} moved to Allowed List`, 'info');
            }
            await this.manageBlockList(ctx);
        } else if (action === 'Delete') {
            const ok = await ctx.ui.confirm('Delete', `Remove ${number} from Block List?`);
            if (ok) {
                await this.sessionManager.unblockNumber(number);
                ctx.ui.notify(`${number} removed from Block List`, 'info');
            }
            await this.manageBlockList(ctx);
        } else {
            await this.manageBlockList(ctx);
        }
    }

    private async manageRecents(ctx: ExtensionCommandContext) {
        const recentConversations = await this.recentsService.getRecentConversations();

        if (recentConversations.length === 0) {
            ctx.ui.notify('No recent individual conversations yet.', 'info');
            await this.handleCommand(ctx);
            return;
        }

        const options = [
            ...recentConversations.map(conversation => this.formatRecentConversationOption(conversation)),
            'Back'
        ];

        const choice = await ctx.ui.select('Recents', options);
        if (!choice || choice === 'Back') {
            await this.handleCommand(ctx);
            return;
        }

        const selectedConversation = recentConversations.find(conversation =>
            this.formatRecentConversationOption(conversation) === choice
        );

        if (!selectedConversation) {
            await this.manageRecents(ctx);
            return;
        }

        await this.manageRecentConversation(ctx, selectedConversation);
    }

    private async manageRecentConversation(ctx: ExtensionCommandContext, conversation: RecentConversationSummary) {
        const displayName = this.getConversationDisplayName(conversation);
        const allowedContact = this.sessionManager.getAllowedContact(conversation.senderNumber);
        const options: string[] = ['History'];

        if (!allowedContact) {
            options.push('Allow Number');
        }

        options.push('Send Message');

        if (allowedContact?.name) {
            options.push('Remove Alias');
        }

        options.push('Back');

        const choice = await ctx.ui.select(`Recents • ${displayName}`, options);

        if (choice === 'Allow Number') {
            if (this.sessionManager.isAllowed(conversation.senderNumber)) {
                ctx.ui.notify(`${conversation.senderNumber} is already in the allow list`, 'info');
            } else {
                await this.sessionManager.addNumber(conversation.senderNumber, conversation.senderName);
                ctx.ui.notify(`Added ${conversation.senderNumber} to the allow list`, 'info');
            }
            await this.manageRecentConversation(ctx, conversation);
            return;
        }

        if (choice === 'Remove Alias') {
            await this.sessionManager.removeAllowedContactAlias(conversation.senderNumber);
            ctx.ui.notify(`Alias removed for ${conversation.senderNumber}`, 'info');
            await this.manageRecentConversation(ctx, {
                ...conversation,
                senderName: undefined
            });
            return;
        }

        if (choice === 'Send Message') {
            await this.sendMessageFromRecents(ctx, conversation);
            await this.manageRecentConversation(ctx, conversation);
            return;
        }

        if (choice === 'History') {
            await this.showConversationHistory(ctx, conversation);
            await this.manageRecentConversation(ctx, conversation);
            return;
        }

        await this.manageRecents(ctx);
    }

    private async sendMessageFromRecents(ctx: ExtensionCommandContext, conversation: RecentConversationSummary) {
        await this.sendPromptedMenuMessage(ctx, {
            displayName: this.getConversationDisplayName(conversation),
            senderNumber: conversation.senderNumber,
            senderName: conversation.senderName,
            appendPiSuffix: false
        });
    }

    private async sendMessageToAllowedNumber(ctx: ExtensionCommandContext, contact: Contact) {
        await this.sendPromptedMenuMessage(ctx, {
            displayName: this.formatAllowedContactOption(contact),
            senderNumber: contact.number,
            senderName: contact.name,
            appendPiSuffix: true
        });
    }

    private async sendPromptedMenuMessage(
        ctx: ExtensionCommandContext,
        options: {
            displayName: string;
            senderNumber: string;
            senderName?: string;
            appendPiSuffix: boolean;
        }
    ) {
        const { displayName, senderNumber, senderName, appendPiSuffix } = options;
        for (let attempt = 0; attempt < 2; attempt++) {
            const inputText = (await ctx.ui.input(`Send a message to ${displayName}:`))?.trim() || '';

            if (!inputText) {
                ctx.ui.notify('Please enter a message before sending.', 'error');
                continue;
            }

            const messageText = appendPiSuffix ? `${inputText} π` : inputText;
            const result = await this.whatsappService.sendMenuMessage(this.toJid(senderNumber), messageText);
            if (result.success) {
                await this.recentsService.recordMessage({
                    messageId: result.messageId ?? `${Date.now()}`,
                    senderNumber,
                    senderName,
                    text: messageText,
                    direction: 'outgoing',
                    timestamp: Date.now()
                });
                ctx.ui.notify(`Sent message to ${displayName}`, 'info');
            } else {
                ctx.ui.notify(`Failed to send message to ${displayName}: ${result.error ?? 'Unknown error'}`, 'error');
            }
            return;
        }
    }

    private async showConversationHistory(ctx: ExtensionCommandContext, conversation: RecentConversationSummary) {
        await this.showConversationHistoryForNumber(
            ctx,
            conversation.senderNumber,
            this.getConversationDisplayName(conversation),
            conversation.senderName
        );
    }

    private async showConversationHistoryForNumber(
        ctx: ExtensionCommandContext,
        senderNumber: string,
        displayName: string,
        senderName?: string
    ) {
        const history = await this.recentsService.getConversationHistory(senderNumber);

        if (history.length === 0) {
            ctx.ui.notify('No message history available for this conversation.', 'info');
            return;
        }

        const historyOptions = this.buildHistoryOptions(this.sortHistoryByMostRecent(history));
        const choice = await ctx.ui.select(`History • ${displayName}`, [
            ...historyOptions.map(option => option.label),
            'Back'
        ]);

        if (!choice || choice === 'Back') {
            return;
        }

        const selectedMessage = this.resolveHistorySelection(choice, historyOptions);
        if (!selectedMessage) {
            return;
        }

        const detailAction = await showMessageDetailView(ctx, {
            title: `Message • ${displayName}`,
            messageId: selectedMessage.messageId,
            senderNumber: selectedMessage.senderNumber,
            senderName,
            text: selectedMessage.text,
            direction: selectedMessage.direction,
            timestamp: selectedMessage.timestamp
        });

        if (detailAction === 'reply') {
            await showMessageReplyView(ctx, {
                selectedMessage: {
                    messageId: selectedMessage.messageId,
                    senderNumber: selectedMessage.senderNumber,
                    senderName,
                    text: selectedMessage.text,
                    direction: selectedMessage.direction,
                    timestamp: selectedMessage.timestamp
                },
                whatsappService: this.whatsappService,
                recentsService: this.recentsService
            });
        }
    }

    private buildHistoryOptions(history: RecentConversationMessage[]): HistoryOptionEntry[] {
        return history.map(message => ({
            label: this.formatHistoryOption(message.timestamp, message.direction, message.text),
            message
        }));
    }

    private resolveHistorySelection(choice: string, options: HistoryOptionEntry[]): RecentConversationMessage | undefined {
        return options.find(option => option.label === choice)?.message;
    }

    private formatRecentConversationOption(conversation: RecentConversationSummary): string {
        const displayName = this.getConversationDisplayName(conversation);
        const time = this.formatDateTime(conversation.lastMessageTime);
        return `${displayName} • ${time} • ${conversation.lastMessagePreview}`;
    }

    private formatAllowedContactOption(contact: Contact): string {
        return contact.name ? `${contact.name} (${contact.number})` : contact.number;
    }

    private sortContactsAlphabetically(contacts: Contact[]): Contact[] {
        return [...contacts].sort((left, right) => {
            const leftLabel = this.formatAllowedContactSortKey(left);
            const rightLabel = this.formatAllowedContactSortKey(right);
            return leftLabel.localeCompare(rightLabel, undefined, { sensitivity: 'base' });
        });
    }

    private formatAllowedContactSortKey(contact: Contact): string {
        return contact.name ? `${contact.name} ${contact.number}` : contact.number;
    }

    private parseContactNumberOption(choice: string): string {
        if (!choice.includes('(')) {
            return choice;
        }

        const match = choice.match(/\((.*?)\)/);
        return match?.[1] ?? choice;
    }

    private sortHistoryByMostRecent<T extends { timestamp: number }>(history: T[]): T[] {
        return [...history].sort((left, right) => {
            const dayComparison = this.getDayStart(right.timestamp) - this.getDayStart(left.timestamp);
            if (dayComparison !== 0) {
                return dayComparison;
            }

            return this.getTimeOfDay(right.timestamp) - this.getTimeOfDay(left.timestamp);
        });
    }

    private getTimeOfDay(timestamp: number): number {
        const date = new Date(timestamp);
        return date.getHours() * 60 * 60 * 1000
            + date.getMinutes() * 60 * 1000
            + date.getSeconds() * 1000
            + date.getMilliseconds();
    }

    private getDayStart(timestamp: number): number {
        const date = new Date(timestamp);
        return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    }

    private formatHistoryOption(timestamp: number, direction: string, text: string): string {
        const marker = direction === 'outgoing' ? 'Sent' : 'Received';
        const displayText = this.truncate(text, 60) || '[No text]';
        return `${this.formatDateTimeWithSeconds(timestamp)} • ${marker} • ${displayText}`;
    }

    private getConversationDisplayName(conversation: RecentConversationSummary): string {
        const allowedContact = this.sessionManager.getAllowedContact(conversation.senderNumber);
        const displayName = allowedContact?.name || conversation.senderName;
        return displayName ? `${displayName} (${conversation.senderNumber})` : conversation.senderNumber;
    }

    private formatDateTime(timestamp: number): string {
        return new Intl.DateTimeFormat(undefined, {
            dateStyle: 'short',
            timeStyle: 'short'
        }).format(new Date(timestamp));
    }

    private formatDateTimeWithSeconds(timestamp: number): string {
        return new Intl.DateTimeFormat(undefined, {
            dateStyle: 'short',
            timeStyle: 'medium'
        }).format(new Date(timestamp));
    }

    private truncate(value: string, maxLength: number): string {
        const normalized = value.trim().replace(/\s+/g, ' ');
        if (!normalized) {
            return '';
        }
        if (normalized.length <= maxLength) {
            return normalized;
        }
        return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
    }

    private toJid(number: string): string {
        if (number.includes('@')) {
            return number;
        }

        const normalized = number.startsWith('+') ? number.slice(1) : number;
        return `${normalized}@s.whatsapp.net`;
    }
}
