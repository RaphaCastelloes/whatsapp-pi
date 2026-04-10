import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { SessionManager } from './src/services/session.manager.js';
import { WhatsAppService } from './src/services/whatsapp.service.js';
import { MenuHandler } from './src/ui/menu.handler.js';

export default function(pi: ExtensionAPI) {
    const sessionManager = new SessionManager();
    const whatsappService = new WhatsAppService(sessionManager);
    const menuHandler = new MenuHandler(whatsappService, sessionManager);

    // Initialize state from session history
    pi.on("session_start", async (_event, ctx) => {
        await sessionManager.ensureInitialized();
        
        for (const entry of ctx.sessionManager.getEntries()) {
            if (entry.type === "custom" && entry.customType === "whatsapp-state") {
                const data = entry.data as any;
                if (data.status) await sessionManager.setStatus(data.status);
                if (data.allowList) {
                    for (const n of data.allowList) {
                        await sessionManager.addNumber(n);
                    }
                }
            }
        }

        // Auto-connect if we have a saved session
        if (await sessionManager.isRegistered()) {
            ctx.ui.setStatus('whatsapp', 'WhatsApp: Connecting...');
            await whatsappService.start();
        }
    });

    // Handle incoming messages by injecting them as user prompts
    whatsappService.setMessageCallback((m) => {
        const msg = m.messages[0];
        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
        const sender = msg.key.remoteJid?.split('@')[0] || "unknown";
        const pushName = msg.pushName || "WhatsApp User";

        pi.sendUserMessage(`[WhatsApp Message from ${pushName} (+${sender})]: ${text}`, { 
            deliverAs: "followUp" 
        });
    });

    // Register the command
    pi.registerCommand("whatsapp", {
        description: "Manage WhatsApp integration",
        handler: async (args, ctx) => {
            await menuHandler.handleCommand(ctx);
            
            // Persist state after changes
            pi.appendEntry("whatsapp-state", {
                status: sessionManager.getStatus(),
                allowList: sessionManager.getAllowList()
            });
        }
    });

    // Handle outgoing messages (Agent -> WhatsApp)
    pi.on("message_end", async (event, ctx) => {
        if (sessionManager.getStatus() !== 'connected') return;

        const { message } = event;
        // Only reply if it's the assistant and we have a valid target
        if (message.role === "assistant") {
            const lastJid = whatsappService.getLastRemoteJid();
            const text = message.content.filter(c => c.type === "text").map(c => c.text).join("\n");

            if (lastJid && text) {
                try {
                    await whatsappService.sendMessage(lastJid, text);
                    ctx.ui.notify(`Sent reply to WhatsApp contact`, 'info');
                } catch (error) {
                    ctx.ui.notify(`Failed to send WhatsApp reply`, 'error');
                }
            }
        }
    });
}
