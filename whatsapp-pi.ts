import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { SessionManager } from './src/services/session.manager.js';
import { WhatsAppService } from './src/services/whatsapp.service.js';
import { MenuHandler } from './src/ui/menu.handler.js';

console.log("[WhatsApp-Pi] Extension file loaded by Pi...");
export default function(pi: ExtensionAPI) {
    // Register verbose flag
    pi.registerFlag("v", {
        description: "Enable verbose mode (show Baileys trace logs)",
        type: "boolean",
        default: false
    });
    pi.registerFlag("verbose", {
        description: "Enable verbose mode (show Baileys trace logs)",
        type: "boolean",
        default: false
    });
    
    // Register connect flags
    pi.registerFlag("c", {
        description: "Auto-connect to WhatsApp on startup",
        type: "boolean",
        default: false
    });
    pi.registerFlag("connect", {
        description: "Auto-connect to WhatsApp on startup",
        type: "boolean",
        default: false
    });

    const sessionManager = new SessionManager();
    const whatsappService = new WhatsAppService(sessionManager);
    const menuHandler = new MenuHandler(whatsappService, sessionManager);

    // Initial status setup
    pi.on("session_start", async (_event, ctx) => {
        // Check verbose mode
        const isVerboseFlagSet = pi.getFlag("v") === true || pi.getFlag("verbose") === true || process.argv.includes("-v") || process.argv.includes("--verbose");
        
        const isVerbose = isVerboseFlagSet;
        
        whatsappService.setVerboseMode(isVerbose);
        
        if (isVerbose) {
            console.log('[WhatsApp-Pi] Verbose mode enabled - Baileys trace logs will be shown');
        }
        ctx.ui.setStatus('whatsapp', '|  WhatsApp: Disconnected');
        whatsappService.setStatusCallback((status) => {
            ctx.ui.setStatus('whatsapp', status);
        });
        await sessionManager.ensureInitialized();
        
        for (const entry of ctx.sessionManager.getEntries()) {
            if (entry.type === "custom" && entry.customType === "whatsapp-state") {
                const data = entry.data as any;
                if (data.status) await sessionManager.setStatus(data.status);
                if (data.allowList) {
                    for (const n of data.allowList) {
                        await sessionManager.addNumber(typeof n === "string" ? n : n.number, typeof n === "string" ? undefined : n.name);
                    }
                }
            }
        }

        // Check connect flag
        const isConnectFlagSet = pi.getFlag("c") === true || pi.getFlag("connect") === true || process.argv.includes("-c") || process.argv.includes("--connect");
        
        // Auto-connect removed to avoid socket conflicts
        if (await sessionManager.isRegistered()) {
            const shouldConnect = isConnectFlagSet;

            if (shouldConnect) {
                ctx.ui.setStatus('whatsapp', '|  WhatsApp: Auto-connecting...');
                
                // Retry logic (max 3 attempts, 3s delay)
                let attempts = 0;
                const maxAttempts = 4; // Initial + 3 retries
                
                const tryConnect = async () => {
                    attempts++;
                    try {
                        await whatsappService.start();
                    } catch (error) {
                        if (attempts < maxAttempts) {
                            ctx.ui.notify(`WhatsApp: Connection attempt ${attempts} failed. Retrying...`, 'warning');
                            setTimeout(tryConnect, 3000);
                        } else {
                            ctx.ui.notify('WhatsApp: Auto-connect failed after multiple attempts.', 'error');
                            ctx.ui.setStatus('whatsapp', '|  WhatsApp: Connection Failed');
                        }
                    }
                };

                await tryConnect();
            } else {
                // We just ensure state is loaded, but do NOT call whatsappService.start()
                await sessionManager.setStatus('disconnected');
            }
        } else if (isConnectFlagSet) {
            ctx.ui.notify('WhatsApp: Auto-connect skipped. Manual login required.', 'info');
        }
    });

    // Handle incoming messages by injecting them as user prompts
    whatsappService.setMessageCallback((m) => {
        const msg = m.messages[0];
        if (!msg.message) return;

        let text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
        
        const sender = msg.key.remoteJid?.split('@')[0] || "unknown";
        const pushName = msg.pushName || "WhatsApp User";

        // Handle media types
        if (!text) {
            if (msg.message.imageMessage) text = "[Image]";
            else if (msg.message.videoMessage) text = "[Video]";
            else if (msg.message.stickerMessage) text = "[Sticker]";
            else if (msg.message.audioMessage) text = "[Audio]";
            else if (msg.message.documentMessage) text = "[Document]";
            else if (msg.message.contactMessage || msg.message.contactsArrayMessage) text = "[Contact]";
            else if (msg.message.locationMessage) text = "[Location]";
            else text = "[Unsupported Message Type]";
        }

        // Always log to console so it appears in the TUI log pane
        console.log(`[WhatsApp-Pi] ${pushName} (+${sender}): ${text}`);

        // Use a standard delivery to see if it improves TUI visibility
        pi.sendUserMessage(`Mensagem de ${pushName} (+${sender}): ${text}`);
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
