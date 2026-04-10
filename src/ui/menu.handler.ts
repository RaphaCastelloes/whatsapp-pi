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
        options.push('Exit');

        const choice = await ctx.ui.select(`WhatsApp (Status: ${status})`, options);

        switch (choice) {
            case 'Connect WhatsApp':
                this.whatsappService.setQRCodeCallback((qr) => {
                    console.log('\n\n=== WhatsApp QR Code ===');
                    console.log('Scan this QR code with WhatsApp on your phone:\n');
                    qrcode.generate(qr, { small: true });
                    console.log('\n');
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
        const displayList = list.map(c => c.name ? `${c.name} (${c.number})` : c.number);
        const options = [...displayList.map(d => `Remove ${d}`), 'Add Number', 'Back'];
        
        const choice = await ctx.ui.select('Allowed Numbers', options);

        if (choice === 'Add Number') {
            const num = await ctx.ui.input('Enter number (e.g. +5511999999999):');
            if (num && validatePhoneNumber(num)) {
                const name = await ctx.ui.input('Enter name (optional, press Enter to skip):');
                await this.sessionManager.addNumber(num, name || undefined);
                const display = name ? `${name} (${num})` : num;
                ctx.ui.notify(`Added ${display}`, 'info');
            } else {
                ctx.ui.notify('Invalid number format', 'error');
            }
            await this.manageAllowList(ctx);
        } else if (choice?.startsWith('Remove ')) {
            const display = choice.replace('Remove ', '');
            // Extract number from display (could be "Name (number)" or just "number")
            const match = display.match(/\(([+\d]+)\)$/);
            const num = match ? match[1] : display;
            await this.sessionManager.removeNumber(num);
            ctx.ui.notify(`Removed ${display}`, 'info');
            await this.manageAllowList(ctx);
        }
    }

    private async manageBlockList(ctx: ExtensionCommandContext) {
        const ignoredList = this.sessionManager.getIgnoredNumbers();
        
        if (ignoredList.length === 0) {
            ctx.ui.notify('No ignored numbers (all messages are from allowed contacts)', 'info');
            await this.handleCommand(ctx);
            return;
        }

        const displayList = ignoredList.map(c => c.name ? `${c.name} (${c.number})` : c.number);
        const options = [...displayList, 'Back'];
        
        const choice = await ctx.ui.select('Blocked Numbers (Not in Allow List)', options);

        if (choice === 'Back') {
            await this.handleCommand(ctx);
        } else if (choice) {
            // Extract number from display
            const match = choice.match(/\(([+\d]+)\)$/);
            const num = match ? match[1] : choice;
            await this.manageBlockedNumber(ctx, num, choice);
        }
    }

    private async manageBlockedNumber(ctx: ExtensionCommandContext, number: string, display: string) {
        const action = await ctx.ui.select(`Manage ${display}`, ['Allow', 'Back']);

        if (action === 'Allow') {
            const ok = await ctx.ui.confirm('Allow', `Add ${display} to Allowed Numbers?`);
            if (ok) {
                // Get the name from ignored list
                const ignored = this.sessionManager.getIgnoredNumbers().find(c => c.number === number);
                await this.sessionManager.addNumber(number, ignored?.name);
                ctx.ui.notify(`${display} added to Allowed List`, 'info');
            }
            await this.manageBlockList(ctx);
        } else {
            await this.manageBlockList(ctx);
        }
    }
}
