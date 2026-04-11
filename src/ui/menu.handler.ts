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

        if (registered) options.push('Logoff (Delete Session)');
        
        options.push('Allow Numbers');
        options.push('Blocked Numbers');
        options.push('Back');

        const choice = await ctx.ui.select(`WhatsApp (Status: ${status})`, options);

        switch (choice) {
            case 'Connect WhatsApp':
                this.whatsappService.setQRCodeCallback((qr) => {
                    ctx.ui.notify('Scan the QR code in the terminal', 'info');
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
                const confirm = await ctx.ui.confirm('Logoff', 'Delete all credentials?');
                if (confirm) {
                    await this.whatsappService.logout();
                    ctx.ui.notify('Logged off and credentials deleted', 'info');
                }
                break;
            case 'Allow Numbers':
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
        const options = [...list.map(c => `Remove ${c.name ? c.name + ' (' + c.number + ')' : c.number}`), 'Add Number', 'Back'];
        
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
        }
    }

    private async manageBlockList(ctx: ExtensionCommandContext) {
        const list = this.sessionManager.getBlockList();
        
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
        const action = await ctx.ui.select(`Manage ${number}`, ['Unblock and Allow', 'Delete', 'Back']);

        if (action === 'Unblock and Allow') {
            const ok = await ctx.ui.confirm('Unblock', `Move ${number} to Allowed Numbers?`);
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
}
