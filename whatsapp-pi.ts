import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { SessionManager } from './src/services/session.manager.js';
import { WhatsAppService } from './src/services/whatsapp.service.js';
import { MenuHandler } from './src/ui/menu.handler.js';
import { AudioService } from './src/services/audio.service.js';

console.log("[WhatsApp-Pi] Extension file loaded by Pi...");
export default function (pi: ExtensionAPI) {
    // Register verbose flag
    pi.registerFlag("verbose", {
        description: "Enable verbose mode (show Baileys trace logs)",
        type: "boolean",
        default: false
    });

    pi.registerFlag("whatsapp-pi-online", {
        description: "Enable WhatsApp-Pi on startup",
        type: "boolean",
        default: false
    });

    const sessionManager = new SessionManager();
    const whatsappService = new WhatsAppService(sessionManager);
    const audioService = new AudioService();
    const menuHandler = new MenuHandler(whatsappService, sessionManager);
    let _ctx: ExtensionContext | undefined;


    // Initial status setup
    pi.on("session_start", async (_event, ctx) => {
        _ctx = ctx;
        // Check verbose mode
        const isVerboseFlagSet = process.argv.includes("--verbose");

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
        const isWhatsappPiOn = process.argv.includes("--whatsapp-pi-online");

        // Auto-connect removed to avoid socket conflicts
        if (await sessionManager.isRegistered()) {
            const shouldConnect = isWhatsappPiOn;

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
        } else {
            ctx.ui.notify('WhatsApp: Manual login required via /whatsapp.', 'info');
        }

        ctx.ui.notify('WhatsApp: Session reset via /new is now fully supported.', 'info');
    });



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
        let imageBuffer: Buffer | undefined;
        let imageMimeType: string | undefined;

        if (msg.message.audioMessage) {
            console.log(`[WhatsApp-Pi] Transcribing audio from ${pushName}...`);
            const transcription = await audioService.transcribe(msg.message.audioMessage);
            text = `[Áudio Transcrito]: ${transcription}`;
        } else if (msg.message.imageMessage) {
            console.log(`[WhatsApp-Pi] Downloading image from ${pushName}...`);
            try {
                const { downloadContentFromMessage } = await import('@whiskeysockets/baileys');
                const stream = await downloadContentFromMessage(msg.message.imageMessage, 'image');
                let buffer = Buffer.from([]);
                for await (const chunk of stream) {
                    buffer = Buffer.concat([buffer, chunk]);
                }
                imageBuffer = buffer;
                
                // Normalize mime type for Cloud Code Assist / Gemini
                let rawMime = msg.message.imageMessage.mimetype || 'image/jpeg';
                imageMimeType = rawMime.toLowerCase().split(';')[0].trim();
                if (imageMimeType === 'image/jpg') imageMimeType = 'image/jpeg';
                
                console.log(`[WhatsApp-Pi] Image downloaded. MIME: ${imageMimeType} (original: ${rawMime}), Size: ${imageBuffer.length} bytes`);
                
                text = msg.message.imageMessage.caption || "[Image]";
            } catch (e) {
                console.error(`[WhatsApp-Pi] Failed to download image:`, e);
                text = "[Image (download failed)]";
            }
        } else if (!text) {
            if (msg.message.videoMessage) text = "[Video]";
            else if (msg.message.stickerMessage) text = "[Sticker]";
            else if (msg.message.documentMessage) text = "[Document]";
            else if (msg.message.contactMessage || msg.message.contactsArrayMessage) text = "[Contact]";
            else if (msg.message.locationMessage) text = "[Location]";
            else text = "[Unsupported Message Type]";
        }

        // Always log to console so it appears in the TUI log pane
        console.log(`[WhatsApp-Pi] ${pushName} (+${sender}): ${text}`);

        // Handle image with dedicated vision model if configured
        if (imageBuffer && imageMimeType && sessionManager.getOpenaiKey()) {
            console.log(`[WhatsApp-Pi] Using dedicated vision model (${sessionManager.getVisionModel()}) for image analysis...`);
            try {
                const openAiKey = sessionManager.getOpenaiKey();
                const visionModel = sessionManager.getVisionModel();
                
                const response = await fetch("https://api.openai.com/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${openAiKey}`
                    },
                    body: JSON.stringify({
                        model: visionModel,
                        messages: [
                            {
                                role: "user",
                                content: [
                                    { type: "text", text: "Descreva esta imagem em detalhes. Se houver texto, transcreva-o." },
                                    {
                                        type: "image_url",
                                        image_url: {
                                            url: `data:${imageMimeType};base64,${imageBuffer.toString('base64')}`
                                        }
                                    }
                                ]
                            }
                        ],
                        max_tokens: 500
                    })
                });

                if (response.ok) {
                    const data = await response.json() as any;
                    const description = data.choices[0].message.content;
                    text = `${text}\n\n[Análise da Imagem por ${visionModel}]:\n${description}`;
                    // Clear buffer/mime so we don't send the image again to Pi
                    imageBuffer = undefined;
                    imageMimeType = undefined;
                } else {
                    const error = await response.text();
                    console.error(`[WhatsApp-Pi] OpenAI Vision API error:`, error);
                    text = `${text}\n\n[Erro na análise da imagem: API retornou ${response.status}]`;
                }
            } catch (e) {
                console.error(`[WhatsApp-Pi] Failed to analyze image with OpenAI:`, e);
                text = `${text}\n\n[Erro ao processar imagem com OpenAI]`;
            }
        }

        // Handle commands
        if (text.trim().toLowerCase().startsWith('/compact')) {
            console.log(`[WhatsApp-Pi] Session compact requested by ${pushName}.`);

            if (_ctx) {
                _ctx.compact();
                await whatsappService.sendMessage(remoteJid!, "Sessão compactada com sucesso! ✅");
            }
            return;
        }

        if (text.trim().toLowerCase().startsWith('/abort')) {
            console.log(`[WhatsApp-Pi] Abort requested by ${pushName}.`);
            if (_ctx) {
                _ctx.abort();
                await whatsappService.sendMessage(remoteJid!, "Abortado! ✅");
            }
            return;
        }

        // Use a standard delivery for ALL messages to ensure TUI consistency
        if (imageBuffer && imageMimeType) {
            pi.sendUserMessage([
                { type: "text", text: `Mensagem de ${pushName} (+${sender}): ${text}` },
                { type: "image", source: { type: "base64", mediaType: imageMimeType as any, data: imageBuffer.toString('base64') } }
            ], { deliverAs: "followUp" });
        } else {
            pi.sendUserMessage(`Mensagem de ${pushName} (+${sender}): ${text}`, { deliverAs: "followUp" });
        }
    });

    // Register commands
    pi.registerCommand("whatsapp", {
        description: "Manage WhatsApp integration",
        handler: async (args, ctx) => {
            _ctx = ctx;
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
