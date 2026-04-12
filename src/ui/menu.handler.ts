import { WhatsAppService } from '../services/whatsapp.service.js';
import { SessionManager } from '../services/session.manager.js';
import { validatePhoneNumber } from '../models/whatsapp.types.js';
import * as qrcode from 'qrcode-terminal';
import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

export class MenuHandler {
    private whatsappService: WhatsAppService;
    private sessionManager: SessionManager;

    constructor(whatsappService: WhatsAppService, sessionManager: SessionManager) {
        this.whatsappService = whatsappService;
        this.sessionManager = sessionManager;
    }

    async handleCommand(ctx: ExtensionCommandContext) {
        const status = this.sessionManager.getStatus();
        const registered = await this.sessionManager.isRegistered();
        const options: string[] = [];

        if (status === 'connected') {
            options.push('Disconnect WhatsApp');
        } else {
            options.push('Connect WhatsApp');
        }

        if (registered) {
            options.push('Logoff (Delete Session)');
        }

        options.push('Allowed Numbers');
        options.push('Blocked Numbers');
        options.push('Back');

        const choice = await ctx.ui.select(`WhatsApp (Status: ${status})`, options);

        switch (choice) {
            case 'Connect WhatsApp':
                this.whatsappService.setQRCodeCallback((qr) => {
                    qrcode.generate(qr, { small: true });
                });
                await this.whatsappService.start();
                ctx.ui.notify('WhatsApp Connection Started', 'info');
                break;
            case 'Disconnect WhatsApp':
                await this.whatsappService.stop();
                ctx.ui.notify('WhatsApp Agent Disconnected', 'warning');
                break;
            case 'Logoff (Delete Session)':
                const confirmLogoff = await ctx.ui.confirm('Logoff', 'Delete all credentials?');
                if (confirmLogoff) {
                    await this.whatsappService.logout();
                    ctx.ui.notify('Logged off and credentials deleted', 'info');
                }
                break;
            case 'Allowed Numbers':
                await this.manageAllowList(ctx);
                break;
            case 'Blocked Numbers':
                await this.manageBlockList(ctx);
                break;
        }
    }

    private async manageAllowList(ctx: ExtensionCommandContext) {
        const list = this.sessionManager.getAllowList();
        // Exibe o nome se existir, senão apenas o número
        let options = [...list.map(c => `Remove ${c.name ? c.name + ' (' + c.number + ')' : c.number}`), 'Add Number'];
        if (list.length > 0) {
            options.push('Clear All');
        }
        options.push('Back');

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
        } else if (choice === 'Clear All') {
            const ok = await ctx.ui.confirm('Clear All', 'Remove all allowed numbers?');
            if (ok) {
                await this.sessionManager.clearAllowList();
                ctx.ui.notify('Allowed numbers cleared', 'info');
            }
            await this.manageAllowList(ctx);
        } else if (choice?.startsWith('Remove ')) {
            // Extrai o número entre parênteses ou o que sobrar depois de "Remove "
            let num = choice.replace('Remove ', '');
            if (num.includes('(')) {
                const match = num.match(/\((.*?)\)/);
                if (match) num = match[1];
            }
            await this.sessionManager.removeNumber(num);
            ctx.ui.notify(`Removed ${num}`, 'info');
            await this.manageAllowList(ctx);
        } else if (choice === 'Back') {
            await this.handleCommand(ctx);
        }
    }

    private async manageBlockList(ctx: ExtensionCommandContext) {
        const list = this.sessionManager.getIgnoredNumbers();
        
        if (list.length === 0) {
            ctx.ui.notify('No blocked numbers', 'info');
            await this.handleCommand(ctx);
            return;
        }

        const options = [...list.map(c => c.name ? `${c.name} (${c.number})` : c.number), 'Back'];
        const choice = await ctx.ui.select('Blocked Numbers (Select to Manage)', options);

        if (choice && choice !== 'Back') {
            let num = choice;
            if (num.includes('(')) {
                const match = num.match(/\((.*?)\)/);
                if (match) num = match[1];
            }
            await this.manageBlockedNumber(ctx, num);
        } else {
            await this.handleCommand(ctx);
        }
    }

    private async manageBlockedNumber(ctx: ExtensionCommandContext, number: string) {
        const action = await ctx.ui.select(`Manage ${number}`, ['Allow', 'Delete', 'Back']);

        if (action === 'Allow') {
            const ok = await ctx.ui.confirm('Allow', `Move ${number} to Allowed Numbers?`);
            if (ok) {
                const list = this.sessionManager.getIgnoredNumbers();
                const contact = list.find(c => c.number === number);
                await this.sessionManager.addNumber(number, contact?.name);
                ctx.ui.notify(`${number} moved to Allowed List`, 'info');
            }
            await this.manageBlockList(ctx);
        } else if (action === 'Delete') {
            const ok = await ctx.ui.confirm('Delete', `Remove ${number} from Block List?`);
            if (ok) {
                await this.sessionManager.removeIgnoredNumber(number);
                ctx.ui.notify(`${number} removed from Block List`, 'info');
            }
            await this.manageBlockList(ctx);
        } else {
            await this.manageBlockList(ctx);
        }
    }
}
