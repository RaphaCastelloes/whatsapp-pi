import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { SessionManager } from './src/services/session.manager.js';
import { WhatsAppService } from './src/services/whatsapp.service.js';
import { MenuHandler } from './src/ui/menu.handler.js';
import { AudioService } from './src/services/audio.service.js';

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
    
    // Register whatsapp flags
    pi.registerFlag("w", {
        description: "Auto-connect to WhatsApp on startup",
        type: "boolean",
        default: false
    });
    pi.registerFlag("whatsapp", {
        description: "Auto-connect to WhatsApp on startup",
        type: "boolean",
        default: false
    });

    const sessionManager = new SessionManager();
    const whatsappService = new WhatsAppService(sessionManager);
    const audioService = new AudioService();
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
                        const num = typeof n === "string" ? n : n.number;
                        const name = typeof n === "string" ? undefined : n.name;
                        await sessionManager.addNumber(num, name);
                    }
                }
            }
        }

        // Check whatsapp flag
        const isConnectFlagSet = pi.getFlag("w") === true || pi.getFlag("whatsapp") === true || process.argv.includes("-w") || process.argv.includes("--whatsapp");
        
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
        
        ctx.ui.notify('WhatsApp: Session reset via /new is now fully supported.', 'info');
    });

    let lastCommandCtx: ExtensionCommandContext | undefined;

    // Handle incoming messages by injecting them as user prompts
    whatsappService.setMessageCallback(async (m) => {
        const msg = m.messages[0];
        if (!msg.message) return;

        let text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
        
        const sender = msg.key.remoteJid?.split('@')[0] || "unknown";
        const pushName = msg.pushName || "WhatsApp User";

        // Mark as read and start typing indicator immediately
        const remoteJid = msg.key.remoteJid;
        if (remoteJid && msg.key.id) {
            whatsappService.markRead(remoteJid, msg.key.id, msg.key.fromMe);
            whatsappService.sendPresence(remoteJid, 'composing');
        }

        // Handle media types
        if (msg.message.audioMessage) {
            console.log(`[WhatsApp-Pi] Transcribing audio from ${pushName}...`);
            const transcription = await audioService.transcribe(msg.message.audioMessage);
            text = `[Áudio Transcrito]: ${transcription}`;
        } else if (!text) {
            if (msg.message.imageMessage) text = "[Image]";
            else if (msg.message.videoMessage) text = "[Video]";
            else if (msg.message.stickerMessage) text = "[Sticker]";
            else if (msg.message.documentMessage) text = "[Document]";
            else if (msg.message.contactMessage || msg.message.contactsArrayMessage) text = "[Contact]";
            else if (msg.message.locationMessage) text = "[Location]";
            else text = "[Unsupported Message Type]";
        }

        // Always log to console so it appears in the TUI log pane
        console.log(`[WhatsApp-Pi] ${pushName} (+${sender}): ${text}`);

        // Handle commands
        if (text.trim().toLowerCase().startsWith('/new')) {
            console.log(`[WhatsApp-Pi] Session reset requested by ${pushName}. Clearing context...`);
            
            await whatsappService.sendMessage(remoteJid!, "Iniciando nova sessão... 🆕\nO contexto anterior foi limpo.");
            if (lastCommandCtx) {
                await lastCommandCtx.newSession();
            } else {
                // Trigger the internal reset command to get a CommandContext
                pi.sendUserMessage("/whatsapp-internal-reset");
            }
            return;
        }

        // Use a standard delivery for ALL messages to ensure TUI consistency
        pi.sendUserMessage(`Mensagem de ${pushName} (+${sender}): ${text}`);
    });

    // Internal command to trigger a real new session when we don't have a lastCommandCtx
    pi.registerCommand("whatsapp-internal-reset", {
        description: "Internal WhatsApp session reset",
        handler: async (_args, ctx) => {
            lastCommandCtx = ctx;
            await ctx.newSession();
        }
    });

    // Handle the /new command from within the extension to ensure it clears the context
    pi.on("input", async (event, _ctx) => {
        if (event.source === "extension") {
            const match = event.text.match(/^Mensagem de .* \(\+\d+\): (\/new.*)$/i);
            if (match) {
                if (lastCommandCtx) {
                    await lastCommandCtx.newSession();
                } else {
                    pi.sendUserMessage("/whatsapp-internal-reset");
                }
                return { action: "handled" };
            }
        }
    });

    // Register commands
    pi.registerCommand("whatsapp", {
        description: "Manage WhatsApp integration",
        handler: async (args, ctx) => {
            lastCommandCtx = ctx;
            await menuHandler.handleCommand(ctx);
            
            // Persist state after changes
            pi.appendEntry("whatsapp-state", {
                status: sessionManager.getStatus(),
                allowList: sessionManager.getAllowList()
            });
        }
    });

    // Handle outgoing messages (Agent -> WhatsApp)
    pi.on("agent_start", async (_event, _ctx) => {
        if (sessionManager.getStatus() !== 'connected') return;
        const lastJid = whatsappService.getLastRemoteJid();
        if (lastJid) {
            await whatsappService.sendPresence(lastJid, 'composing');
        }
    });

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

    pi.on("session_shutdown", async () => {
        console.log("[WhatsApp-Pi] Session shutdown detected. Stopping WhatsApp service...");
        await whatsappService.stop();
    });
}
