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

        if (!registered) {
            options.push('Login (Show QR)');
        } else if (status === 'logged-out' || status === 'pairing') {
            options.push('Reconnect');
        }

        if (status === 'connected') options.push('Disconnect Agent');
        if (status === 'disconnected') options.push('Connect Agent');
        if (registered) options.push('Logoff (Delete Session)');
        
        options.push('Allow Numbers');
        options.push('Exit');

        const choice = await ctx.ui.select(`WhatsApp (Status: ${status})`, options);

        switch (choice) {
            case 'Login (Show QR)':
            case 'Reconnect':
                this.whatsappService.setQRCodeCallback((qr) => {
                    ctx.ui.notify('Scan the QR code in the terminal', 'info');
                    qrcode.generate(qr, { small: true });
                });
                await this.whatsappService.start();
                break;
            case 'Connect Agent':
                await this.sessionManager.setStatus('connected');
                ctx.ui.notify('WhatsApp Agent Connected', 'success');
                break;
            case 'Disconnect Agent':
                await this.sessionManager.setStatus('disconnected');
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
        }
    }

    private async manageAllowList(ctx: ExtensionCommandContext) {
        const list = this.sessionManager.getAllowList();
        const options = [...list.map(n => `Remove ${n}`), 'Add Number', 'Back'];
        
        const choice = await ctx.ui.select('Allowed Numbers', options);

        if (choice === 'Add Number') {
            const num = await ctx.ui.input('Enter number (e.g. +5511999999999):');
            if (num && validatePhoneNumber(num)) {
                await this.sessionManager.addNumber(num);
                ctx.ui.notify(`Added ${num}`, 'success');
            } else {
                ctx.ui.notify('Invalid number format', 'error');
            }
            await this.manageAllowList(ctx);
        } else if (choice?.startsWith('Remove ')) {
            const num = choice.replace('Remove ', '');
            await this.sessionManager.removeNumber(num);
            ctx.ui.notify(`Removed ${num}`, 'info');
            await this.manageAllowList(ctx);
        }
    }
}
