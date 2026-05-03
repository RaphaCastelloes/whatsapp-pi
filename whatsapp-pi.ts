import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { SessionManager } from './src/services/session.manager.js';
import { WhatsAppService } from './src/services/whatsapp.service.js';
import { MenuHandler } from './src/ui/menu.handler.js';
import { RecentsService } from './src/services/recents.service.js';
import { AudioService } from './src/services/audio.service.js';
import { extractIncomingText } from './src/services/incoming-message.resolver.js';
import { IncomingMediaService } from './src/services/incoming-media.service.js';
import { WhatsAppPiLogger } from './src/services/whatsapp-pi.logger.js';

const shutdownState = globalThis as typeof globalThis & {
    __whatsappPiShutdown?: {
        installed: boolean;
        stop?: () => Promise<void>;
    };
};

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
    const recentsService = new RecentsService(sessionManager);
    const audioService = new AudioService();
    const logger = new WhatsAppPiLogger(false);
    const incomingMediaService = new IncomingMediaService(audioService, logger);
    const menuHandler = new MenuHandler(whatsappService, sessionManager, recentsService);
    let _ctx: ExtensionContext | undefined;

    const installGracefulShutdownHandlers = () => {
        shutdownState.__whatsappPiShutdown ??= { installed: false };
        if (shutdownState.__whatsappPiShutdown.installed) {
            return;
        }

        shutdownState.__whatsappPiShutdown.installed = true;
        
        const shutdown = async (reason: string) => {
            try {
                await shutdownState.__whatsappPiShutdown?.stop?.();
            } catch (error) {
                logger.error(`[WhatsApp-Pi] Graceful shutdown failed during ${reason}:`, error);
            }
        };

        process.once('SIGINT', () => { void shutdown('SIGINT'); });
        process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
    };

    // Initial status setup
    pi.on("session_start", async (_event, ctx) => {
        _ctx = ctx;
        // Check verbose mode
        const isVerboseFlagSet = process.argv.includes("--verbose");

        const isVerbose = isVerboseFlagSet;

        whatsappService.setVerboseMode(isVerbose);
        logger.setVerbose(isVerbose);

        if (isVerbose) {
            logger.log('[WhatsApp-Pi] Verbose mode enabled - Baileys trace logs will be shown');
        }
        ctx.ui.setStatus('whatsapp', '| WhatsApp: Disconnected');
        whatsappService.setStatusCallback((status) => {
            ctx.ui.setStatus('whatsapp', status);
        });
        await sessionManager.ensureInitialized();
        await recentsService.ensureInitialized();
        installGracefulShutdownHandlers();
        shutdownState.__whatsappPiShutdown = {
            installed: shutdownState.__whatsappPiShutdown?.installed ?? false,
            stop: async () => {
                await whatsappService.stop();
            }
        };
        whatsappService.setIncomingMessageRecorder(async (message) => {
            await recentsService.recordMessage({
                messageId: message.id,
                senderNumber: `+${message.remoteJid.split('@')[0]}`,
                senderName: message.pushName,
                text: message.text || '',
                direction: 'incoming',
                timestamp: message.timestamp
            });
        });

        const savedStateEntry = [...ctx.sessionManager.getEntries()]
            .reverse()
            .find(entry => entry.type === "custom" && entry.customType === "whatsapp-state");
        const isWhatsappPiOn = pi.getFlag("whatsapp-pi-online") === true;
        const registered = await sessionManager.isRegistered();

        if (savedStateEntry) {
            const data = (savedStateEntry as { data?: any }).data;
            if (data.status) {
                const restoredStatus = data.status === 'connected' && !(isWhatsappPiOn && registered)
                    ? 'disconnected'
                    : data.status;
                await sessionManager.setStatus(restoredStatus);
            }
            if (Array.isArray(data.allowList)) {
                for (const n of data.allowList) {
                    const num = typeof n === "string" ? n : n.number;
                    const name = typeof n === "string" ? undefined : n.name;
                    await sessionManager.addNumber(num, name);
                }
            }
        }

        if (isWhatsappPiOn && registered) {
            ctx.ui.setStatus('whatsapp', '| WhatsApp: Auto-connecting...');

            // Retry logic (max 3 attempts, 3s delay)
            let attempts = 0;
            const maxAttempts = 4; // Initial + 3 retries

            const tryConnect = async () => {
                attempts++;
                try {
                    await whatsappService.start({ allowPairingOnAuthFailure: false });
                } catch {
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
        } else if (isWhatsappPiOn) {
            ctx.ui.notify('WhatsApp: Auto-connect requested, but no saved WhatsApp credentials were found. Use Connect WhatsApp once to scan the QR code.', 'warning');
        } else {
            ctx.ui.notify('WhatsApp: Use Connect / Reconnect WhatsApp. QR code will appear only if pairing is needed.', 'info');
        }

        ctx.ui.notify('WhatsApp: Session reset via /new is now fully supported.', 'info');

        // Verify pdftotext availability for document support
        try {
            const { code } = await pi.exec('pdftotext', ['-v']);
            if (code !== 0 && code !== 99) { // 99 is a common exit code for -v in some versions
                throw new Error(`pdftotext returned code ${code}`);
            }
        } catch {
            ctx.ui.notify('WhatsApp: pdftotext not found. PDF document support will be limited to storage only.', 'warning');
            logger.warn('[WhatsApp-Pi] Warning: pdftotext not found in system PATH.');
        }
    });

    // Handle incoming messages by injecting them as user prompts
    whatsappService.setMessageCallback(async (m) => {
        const msg = m.messages?.[0];
        if (!msg?.message) return;

        const sender = msg.key.remoteJid?.split('@')[0] || "unknown";
        const pushName = msg.pushName || "WhatsApp User";

        // Mark as read and start typing indicator immediately
        const remoteJid = msg.key.remoteJid;
        if (remoteJid && msg.key.id) {
            whatsappService.markRead(remoteJid, msg.key.id, msg.key.fromMe);
            whatsappService.sendPresence(remoteJid, 'composing');
        }

        const resolved = extractIncomingText(msg.message);
        if (resolved.kind === 'system') {
            logger.log(`[WhatsApp-Pi] ${pushName} (${sender}): ${resolved.text}`);
            return;
        }

        const { text, imageBuffer, imageMimeType } = await incomingMediaService.process(resolved, pushName);

        logger.log(`[WhatsApp-Pi] ${pushName} (${sender}): ${text}`);

        // Use a standard delivery for ALL messages to ensure TUI consistency
        if (imageBuffer && imageMimeType) {
            pi.sendUserMessage([
                { type: "text", text: `Message from ${pushName} (${sender}): ${text}` },
                { type: "image", data: imageBuffer.toString('base64'), mimeType: imageMimeType }
            ], { deliverAs: "followUp" });
        } else {
            pi.sendUserMessage(`Message from ${pushName} (${sender}): ${text}`, { deliverAs: "followUp" });
        }

        // Handle commands
        if (text.trim().toLowerCase().startsWith('/compact')) {
            logger.log(`[WhatsApp-Pi] Session compact requested by ${pushName}.`);

            if (_ctx) {
                _ctx.compact();
                await whatsappService.sendMessage(remoteJid!, "Session compacted successfully! ✅");
            }
            return;
        }

        if (text.trim().toLowerCase().startsWith('/abort')) {
            logger.log(`[WhatsApp-Pi] Abort requested by ${pushName}.`);
            if (_ctx) {
                _ctx.abort();
                await whatsappService.sendMessage(remoteJid!, "Aborted! ✅");
            }
            return;
        }

        
    });

    // Register send_wa_message tool (LLM-callable)
    pi.registerTool({
        name: "send_wa_message",
        label: "Send WhatsApp Message",
        description: "Send a WhatsApp message to a contact identified by their JID (e.g. 5511999998888@s.whatsapp.net). Returns a JSON result with success status and messageId or error.",
        promptSnippet: "send_wa_message(jid, message) - Send a WhatsApp message to a contact by JID",
        parameters: Type.Object({
            jid: Type.String({ minLength: 1, description: "WhatsApp JID of the recipient, e.g. 5511999998888@s.whatsapp.net" }),
            message: Type.String({ minLength: 1, description: "Plain-text message content to send" })
        }),
        async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
            if (whatsappService.getStatus() !== 'connected') {
                return {
                    isError: true,
                    details: undefined,
                    content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: "WhatsApp not connected", attempts: 0 }) }]
                };
            }

            const formattedMessage = params.message
                .split('\n')
                .map((line) => `    ${line}`)
                .join('\n');

            console.log([
                '[WhatsApp-Pi] Outgoing WhatsApp message',
                `  To: ${params.jid}`,
                '  Message:',
                formattedMessage
            ].join('\n'));

            const result = await whatsappService.sendMessage(params.jid, params.message);

            if (result.success) {
                await recentsService.recordMessage({
                    messageId: result.messageId!,
                    senderNumber: `+${params.jid.split('@')[0]}`,
                    text: params.message,
                    direction: 'outgoing',
                    timestamp: Date.now()
                });
                console.log([
                    '[WhatsApp-Pi] Outgoing WhatsApp message result',
                    `  To: ${params.jid}`,
                    '  Status: sent',
                    `  MessageId: ${result.messageId ?? 'unknown'}`
                ].join('\n'));
            } else {
                console.log([
                    '[WhatsApp-Pi] Outgoing WhatsApp message result',
                    `  To: ${params.jid}`,
                    '  Status: failed',
                    `  Error: ${result.error ?? 'unknown error'}`
                ].join('\n'));
            }

            return {
                isError: !result.success,
                details: undefined,
                content: [{ type: "text" as const, text: JSON.stringify({ success: result.success, messageId: result.messageId, error: result.error, attempts: result.attempts }) }]
            };
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
                    const result = await whatsappService.sendMessage(lastJid, text);
                    if (result.success) {
                        await recentsService.recordMessage({
                            messageId: result.messageId ?? `${Date.now()}`,
                            senderNumber: `+${lastJid.split('@')[0]}`,
                            text,
                            direction: 'outgoing',
                            timestamp: Date.now()
                        });
                        ctx.ui.notify(`Sent reply to WhatsApp contact`, 'info');
                    } else {
                        ctx.ui.notify(`Failed to send WhatsApp reply`, 'error');
                    }
                } catch {
                    ctx.ui.notify(`Failed to send WhatsApp reply`, 'error');
                }
            }
        }
    });

    pi.on("session_shutdown", async () => {
        logger.log("[WhatsApp-Pi] Session shutdown detected. Stopping WhatsApp service...");
        await whatsappService.stop();
    });
}
