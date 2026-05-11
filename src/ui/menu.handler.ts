import { WhatsAppService } from '../services/whatsapp.service.js';
import { SessionManager, type Contact } from '../services/session.manager.js';
import { validatePhoneNumber, type RecentConversationMessage, type RecentConversationSummary } from '../models/whatsapp.types.js';
import { RecentsService } from '../services/recents.service.js';
import { showMessageDetailView } from './message-detail.view.js';
import { showMessageReplyView } from './message-reply.view.js';
import * as qrcode from 'qrcode-terminal';
import type { ExtensionCommandContext } from '@mariozechner/pi-coding-agent';
import { t } from '../i18n.js';

interface HistoryOptionEntry {
    label: string;
    message: RecentConversationMessage;
}

export class MenuHandler {
    private readonly printedAllowedContacts: string[] = [];
    private readonly printedAllowedGroups: string[] = [];

    constructor(
        private readonly whatsappService: WhatsAppService,
        private readonly sessionManager: SessionManager,
        private readonly recentsService: RecentsService
    ) {}

    async handleCommand(ctx: ExtensionCommandContext) {
        const status = this.whatsappService.getEffectiveStatus();
        const registered = await this.sessionManager.isRegistered();
        const title = t('menu.whatsapp.title', { status });
        const recentsLabel = t('menu.root.recents');
        const allowedContactsLabel = t('menu.root.allowedNumbers');
        const allowedGroupsLabel = t('menu.root.allowedGroups');
        const disconnectWhatsAppLabel = t('menu.root.disconnectWhatsApp');
        const connectWhatsAppLabel = t('menu.root.connectWhatsApp');
        const logoffDeleteSessionLabel = t('menu.root.logoffDeleteSession');
        const backLabel = t('menu.root.back');
        const options: string[] = [];

        if (status === 'connected') {
            options.push(recentsLabel);
            options.push(allowedContactsLabel);
            options.push(allowedGroupsLabel);
            options.push(disconnectWhatsAppLabel);
        } else {
            options.push(connectWhatsAppLabel);
        }

        if (registered) {
            options.push(logoffDeleteSessionLabel);
        }

        options.push(backLabel);

        const choice = await ctx.ui.select(title, options);

        switch (choice) {
            case connectWhatsAppLabel:
                if (status === 'connected') {
                    ctx.ui.notify(t('menu.root.alreadyConnected'), 'info');
                    break;
                }
                this.whatsappService.setQRCodeCallback((qr) => {
                    qrcode.generate(qr, { small: true });
                });
                await this.whatsappService.start();
                ctx.ui.notify(registered ? t('menu.root.reconnectStarted') : t('menu.root.pairingStarted'), 'info');
                break;
            case disconnectWhatsAppLabel:
                if (status !== 'connected') {
                    ctx.ui.notify(t('menu.root.alreadyDisconnected'), 'info');
                    break;
                }
                await this.whatsappService.stop();
                ctx.ui.notify(t('menu.root.agentDisconnected'), 'warning');
                break;
            case logoffDeleteSessionLabel: {
                const confirmLogoff = await ctx.ui.confirm(t('menu.root.logoffTitle'), t('menu.root.logoffConfirmMessage'));
                if (confirmLogoff) {
                    await this.whatsappService.logout();
                    ctx.ui.notify(t('menu.root.loggedOffAndDeleted'), 'info');
                }
                break;
            }
            case allowedContactsLabel:
                await this.manageAllowList(ctx);
                break;
            case allowedGroupsLabel:
                await this.manageAllowedGroups(ctx);
                break;
            case recentsLabel:
                await this.manageRecents(ctx);
                break;
        }
    }

    private async manageAllowList(ctx: ExtensionCommandContext) {
        const list = this.sortContactsAlphabetically(this.sessionManager.getAllowList());
        const title = t('menu.allowed.title');
        const addNumberLabel = t('menu.allowed.addNumber');
        const backLabel = t('menu.root.back');
        const options = [...list.map(contact => this.formatAllowedContactOption(contact)), addNumberLabel, backLabel];

        const choice = await ctx.ui.select(title, options);

        if (choice === addNumberLabel) {
            const num = await ctx.ui.input(t('menu.allowed.enterNumber'));
            if (num && validatePhoneNumber(num)) {
                await this.sessionManager.addNumber(num);
                ctx.ui.notify(t('menu.allowed.addedToAllowList', { number: num }), 'info');
            } else {
                ctx.ui.notify(t('menu.allowed.invalidNumber'), 'error');
            }
            await this.manageAllowList(ctx);
            return;
        }

        if (choice === backLabel || !choice) {
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
        const title = t('menu.allowed.contact.title', { displayName });
        const historyLabel = t('menu.allowed.contact.history');
        const sendMessageLabel = t('menu.allowed.contact.sendMessage');
        const printNumberLabel = t('menu.allowed.contact.printNumber');
        const removeAliasLabel = t('menu.allowed.contact.removeAlias');
        const addAliasLabel = t('menu.allowed.contact.addAlias');
        const removeNumberLabel = t('menu.allowed.contact.removeNumber');
        const backLabel = t('menu.allowed.contact.back');
        const options = [historyLabel, sendMessageLabel, printNumberLabel];
        if (contact.name) {
            options.push(removeAliasLabel);
        } else {
            options.push(addAliasLabel);
        }
        options.push(removeNumberLabel, backLabel);

        const choice = await ctx.ui.select(title, options);

        if (choice === sendMessageLabel) {
            await this.sendMessageToAllowedContact(ctx, contact);
            await this.manageAllowedContact(ctx, contact);
            return;
        }

        if (choice === historyLabel) {
            await this.showConversationHistoryForContact(ctx, contact.number, displayName);
            await this.manageAllowedContact(ctx, contact);
            return;
        }

        if (choice === printNumberLabel) {
            this.printAllowedContact(ctx, contact.number);
            await this.manageAllowedContact(ctx, contact);
            return;
        }

        if (choice === addAliasLabel) {
            const alias = await ctx.ui.input(t('menu.allowed.enterAlias', { number: contact.number }));
            const trimmedAlias = alias?.trim() || '';

            if (!trimmedAlias) {
                ctx.ui.notify(t('menu.allowed.pleaseEnterAlias'), 'error');
                await this.manageAllowedContact(ctx, contact);
                return;
            }

            await this.sessionManager.setAllowedContactAlias(contact.number, trimmedAlias);
            ctx.ui.notify(t('menu.allowed.aliasAdded', { number: contact.number }), 'info');
            await this.manageAllowedContact(ctx, { ...contact, name: trimmedAlias });
            return;
        }

        if (choice === removeAliasLabel) {
            await this.sessionManager.removeAllowedContactAlias(contact.number);
            ctx.ui.notify(t('menu.allowed.aliasRemoved', { number: contact.number }), 'info');
            await this.manageAllowedContact(ctx, { ...contact, name: undefined });
            return;
        }

        if (choice === removeNumberLabel) {
            const ok = await ctx.ui.confirm(t('menu.allowed.removeConfirmTitle'), t('menu.allowed.removeConfirmMessage', { displayName }));
            if (ok) {
                await this.sessionManager.removeNumber(contact.number);
                ctx.ui.notify(t('menu.allowed.removed', { displayName }), 'info');
            }
            await this.manageAllowList(ctx);
            return;
        }

        await this.manageAllowList(ctx);
    }

    private printAllowedContact(ctx: ExtensionCommandContext, contactNumber: string) {
        this.printedAllowedContacts.push(contactNumber);
        const output = this.printedAllowedContacts
            .map((entry) => `  • ${entry}`)
            .join('\n');
        console.log([
            t('menu.allowed.printAllowedNumbersTitle'),
            output
        ].join('\n'));
        ctx.ui.notify(this.printedAllowedContacts.join('\n'), 'info');
    }

    private async manageAllowedGroups(ctx: ExtensionCommandContext) {
        const list = this.sortContactsAlphabetically(this.sessionManager.getAllowedGroups());
        const title = t('menu.allowedGroups.title');
        const addGroupLabel = t('menu.allowedGroups.addGroup');
        const backLabel = t('menu.root.back');
        const options = [...list.map(group => this.formatAllowedGroupOption(group)), addGroupLabel, backLabel];

        const choice = await ctx.ui.select(title, options);

        if (choice === addGroupLabel) {
            const groupJid = await ctx.ui.input(t('menu.allowedGroups.enterGroup'));
            if (groupJid && SessionManager.isGroupJid(groupJid)) {
                await this.sessionManager.addAllowedGroup(groupJid);
                ctx.ui.notify(t('menu.allowedGroups.addedToAllowList', { groupJid }), 'info');
            } else {
                ctx.ui.notify(t('menu.allowedGroups.invalidGroup'), 'error');
            }
            await this.manageAllowedGroups(ctx);
            return;
        }

        if (choice === backLabel || !choice) {
            await this.handleCommand(ctx);
            return;
        }

        const selectedGroup = list.find(group => this.formatAllowedGroupOption(group) === choice);
        if (!selectedGroup) {
            await this.manageAllowedGroups(ctx);
            return;
        }

        await this.manageAllowedGroup(ctx, selectedGroup);
    }

    private async manageAllowedGroup(ctx: ExtensionCommandContext, group: Contact) {
        const displayName = this.formatAllowedGroupOption(group);
        const title = t('menu.allowedGroups.group.title', { displayName });
        const historyLabel = t('menu.allowedGroups.group.history');
        const sendMessageLabel = t('menu.allowedGroups.group.sendMessage');
        const printGroupLabel = t('menu.allowedGroups.group.printGroup');
        const removeAliasLabel = t('menu.allowedGroups.group.removeAlias');
        const addAliasLabel = t('menu.allowedGroups.group.addAlias');
        const removeGroupLabel = t('menu.allowedGroups.group.removeGroup');
        const backLabel = t('menu.allowedGroups.group.back');
        const options = [historyLabel, sendMessageLabel, printGroupLabel];
        if (group.name) {
            options.push(removeAliasLabel);
        } else {
            options.push(addAliasLabel);
        }
        options.push(removeGroupLabel, backLabel);

        const choice = await ctx.ui.select(title, options);

        if (choice === sendMessageLabel) {
            await this.sendMessageToAllowedGroup(ctx, group);
            await this.manageAllowedGroup(ctx, group);
            return;
        }

        if (choice === historyLabel) {
            await this.showConversationHistoryForContact(ctx, group.number, displayName);
            await this.manageAllowedGroup(ctx, group);
            return;
        }

        if (choice === printGroupLabel) {
            this.printAllowedGroup(ctx, group.number);
            await this.manageAllowedGroup(ctx, group);
            return;
        }

        if (choice === addAliasLabel) {
            const alias = await ctx.ui.input(t('menu.allowedGroups.enterAlias', { groupJid: group.number }));
            const trimmedAlias = alias?.trim() || '';

            if (!trimmedAlias) {
                ctx.ui.notify(t('menu.allowedGroups.pleaseEnterAlias'), 'error');
                await this.manageAllowedGroup(ctx, group);
                return;
            }

            await this.sessionManager.setAllowedGroupAlias(group.number, trimmedAlias);
            ctx.ui.notify(t('menu.allowedGroups.aliasAdded', { groupJid: group.number }), 'info');
            await this.manageAllowedGroup(ctx, { ...group, name: trimmedAlias });
            return;
        }

        if (choice === removeAliasLabel) {
            await this.sessionManager.removeAllowedGroupAlias(group.number);
            ctx.ui.notify(t('menu.allowedGroups.aliasRemoved', { groupJid: group.number }), 'info');
            await this.manageAllowedGroup(ctx, { ...group, name: undefined });
            return;
        }

        if (choice === removeGroupLabel) {
            const ok = await ctx.ui.confirm(t('menu.allowedGroups.removeConfirmTitle'), t('menu.allowedGroups.removeConfirmMessage', { displayName }));
            if (ok) {
                await this.sessionManager.removeAllowedGroup(group.number);
                ctx.ui.notify(t('menu.allowedGroups.removed', { displayName }), 'info');
            }
            await this.manageAllowedGroups(ctx);
            return;
        }

        await this.manageAllowedGroups(ctx);
    }

    private printAllowedGroup(ctx: ExtensionCommandContext, groupJid: string) {
        this.printedAllowedGroups.push(groupJid);
        const output = this.printedAllowedGroups
            .map((entry) => `  • ${entry}`)
            .join('\n');
        console.log([
            t('menu.allowedGroups.printAllowedGroupsTitle'),
            output
        ].join('\n'));
        ctx.ui.notify(this.printedAllowedGroups.join('\n'), 'info');
    }

    private async manageRecents(ctx: ExtensionCommandContext) {
        const recentConversations = await this.recentsService.getRecentConversations();
        const title = t('menu.recents.title');
        const backLabel = t('menu.root.back');

        if (recentConversations.length === 0) {
            ctx.ui.notify(t('menu.recents.empty'), 'info');
            await this.handleCommand(ctx);
            return;
        }

        const options = [
            ...recentConversations.map(conversation => this.formatRecentConversationOption(conversation)),
            backLabel
        ];

        const choice = await ctx.ui.select(title, options);
        if (!choice || choice === backLabel) {
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
        const isGroup = SessionManager.isGroupJid(conversation.senderNumber);
        const allowedContact = isGroup
            ? this.sessionManager.getAllowedGroup(conversation.senderNumber)
            : this.sessionManager.getAllowedContact(conversation.senderNumber);
        const title = t('menu.recents.contact.title', { displayName });
        const historyLabel = t('menu.recents.contact.history');
        const allowContactLabel = isGroup
            ? t('menu.recents.contact.allowGroup')
            : t('menu.recents.contact.allowNumber');
        const sendMessageLabel = t('menu.recents.contact.sendMessage');
        const removeAliasLabel = t('menu.recents.contact.removeAlias');
        const backLabel = t('menu.recents.contact.back');
        const options: string[] = [historyLabel];

        if (!allowedContact) {
            options.push(allowContactLabel);
        }

        options.push(sendMessageLabel);

        if (allowedContact?.name) {
            options.push(removeAliasLabel);
        }

        options.push(backLabel);

        const choice = await ctx.ui.select(title, options);

        if (choice === allowContactLabel) {
            if (this.sessionManager.isConversationAllowed(conversation.senderNumber)) {
                ctx.ui.notify(t('menu.recents.alreadyAllowed', { number: conversation.senderNumber }), 'info');
            } else if (isGroup) {
                await this.sessionManager.addAllowedGroup(conversation.senderNumber, conversation.senderName);
                ctx.ui.notify(t('menu.recents.addedGroupToAllowList', { groupJid: conversation.senderNumber }), 'info');
            } else {
                await this.sessionManager.addNumber(conversation.senderNumber, conversation.senderName);
                ctx.ui.notify(t('menu.recents.addedToAllowList', { number: conversation.senderNumber }), 'info');
            }
            await this.manageRecentConversation(ctx, conversation);
            return;
        }

        if (choice === removeAliasLabel) {
            if (isGroup) {
                await this.sessionManager.removeAllowedGroupAlias(conversation.senderNumber);
            } else {
                await this.sessionManager.removeAllowedContactAlias(conversation.senderNumber);
            }
            ctx.ui.notify(t('menu.recents.aliasRemoved', { number: conversation.senderNumber }), 'info');
            await this.manageRecentConversation(ctx, {
                ...conversation,
                senderName: undefined
            });
            return;
        }

        if (choice === sendMessageLabel) {
            await this.sendMessageFromRecents(ctx, conversation);
            await this.manageRecentConversation(ctx, conversation);
            return;
        }

        if (choice === historyLabel) {
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

    private async sendMessageToAllowedContact(ctx: ExtensionCommandContext, contact: Contact) {
        await this.sendPromptedMenuMessage(ctx, {
            displayName: this.formatAllowedContactOption(contact),
            senderNumber: contact.number,
            senderName: contact.name,
            appendPiSuffix: true
        });
    }

    private async sendMessageToAllowedGroup(ctx: ExtensionCommandContext, group: Contact) {
        await this.sendPromptedMenuMessage(ctx, {
            displayName: this.formatAllowedGroupOption(group),
            senderNumber: group.number,
            senderName: group.name,
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
            const inputText = (await ctx.ui.input(t('menu.allowed.sendPrompt', { displayName })))?.trim() || '';

            if (!inputText) {
                ctx.ui.notify(t('menu.allowed.messageRequired'), 'error');
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
                ctx.ui.notify(t('menu.allowed.sendSuccess', { displayName }), 'info');
            } else {
                ctx.ui.notify(t('menu.allowed.sendFailure', { displayName, error: result.error ?? 'Unknown error' }), 'error');
            }
            return;
        }
    }

    private async showConversationHistory(ctx: ExtensionCommandContext, conversation: RecentConversationSummary) {
        await this.showConversationHistoryForContact(
            ctx,
            conversation.senderNumber,
            this.getConversationDisplayName(conversation),
            conversation.senderName
        );
    }

    private async showConversationHistoryForContact(
        ctx: ExtensionCommandContext,
        senderNumber: string,
        displayName: string,
        senderName?: string
    ) {
        const history = await this.recentsService.getConversationHistory(senderNumber);

        if (history.length === 0) {
            ctx.ui.notify(t('menu.recents.history.empty'), 'info');
            return;
        }

        const historyOptions = this.buildHistoryOptions(this.sortHistoryByMostRecent(history));
        const choice = await ctx.ui.select(t('menu.recents.history.title', { displayName }), [
            ...historyOptions.map(option => option.label),
            t('menu.root.back')
        ]);

        if (!choice || choice === t('menu.root.back')) {
            return;
        }

        const selectedMessage = this.resolveHistorySelection(choice, historyOptions);
        if (!selectedMessage) {
            return;
        }

        const detailAction = await showMessageDetailView(ctx, {
            title: t('menu.recents.history.messageTitle', { displayName }),
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

    private formatAllowedGroupOption(group: Contact): string {
        return group.name ? `${group.name} (${group.number})` : group.number;
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
        const marker = direction === 'outgoing' ? t('menu.recents.history.sent') : t('menu.recents.history.received');
        const displayText = this.truncate(text, 60) || t('menu.recents.history.noText');
        return `${this.formatDateTimeWithSeconds(timestamp)} • ${marker} • ${displayText}`;
    }

    private getConversationDisplayName(conversation: RecentConversationSummary): string {
        const isGroup = SessionManager.isGroupJid(conversation.senderNumber);
        const allowedContact = isGroup
            ? this.sessionManager.getAllowedGroup(conversation.senderNumber)
            : this.sessionManager.getAllowedContact(conversation.senderNumber);
        const displayName = allowedContact?.name || conversation.senderName;
        const prefix = isGroup ? '[Group] ' : '';
        return displayName ? `${prefix}${displayName} (${conversation.senderNumber})` : `${prefix}${conversation.senderNumber}`;
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
