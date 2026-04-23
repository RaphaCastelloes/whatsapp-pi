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

    pi.registerFlag("whatsapp-group", {
        description: "Bind this agent to a specific WhatsApp group JID (e.g. 120363012345@g.us). When set, only messages from this group are processed.",
        type: "string",
        default: ""
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
    pi.on("session_start", async (event, ctx) => {
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

        // Set up group binding if configured
        const boundGroupJid = (pi.getFlag("whatsapp-group") as string) || "";
        if (boundGroupJid) {
            whatsappService.setGroupBinding(boundGroupJid);
            sessionManager.setGroupJidForAuth(boundGroupJid);
            logger.log(`[WhatsApp-Pi] Group-only mode: bound to ${boundGroupJid}`);
        }

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
            const isGroup = message.remoteJid.endsWith('@g.us');
            const senderNumber = isGroup
                ? message.remoteJid
                : `+${message.remoteJid.split('@')[0]}`;
            await recentsService.recordMessage({
                messageId: message.id,
                senderNumber,
                senderName: message.pushName,
                text: message.text || '',
                direction: 'incoming',
                timestamp: message.timestamp
            });
        });

        const savedStateEntry = [...ctx.sessionManager.getEntries()]
            .reverse()
            .find(entry => entry.type === "custom" && entry.customType === "whatsapp-state");
        const isWhatsappPiOn = event.reason === "startup" && pi.getFlag("whatsapp-pi-online") === true;

        if (savedStateEntry) {
            const data = (savedStateEntry as { data?: any }).data;
            if (data.status) {
                const restoredStatus = data.status === 'connected' && !isWhatsappPiOn
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

        // Check whatsapp flag — only auto-connect on initial startup, not reloads/new sessions
        const registered = await sessionManager.isRegistered();

        if (isWhatsappPiOn && registered) {
            ctx.ui.setStatus('whatsapp', '| WhatsApp: Auto-connecting...');

            // Retry logic (max 3 attempts, 3s delay)
            let attempts = 0;
            const maxAttempts = 4; // Initial + 3 retries

            const tryConnect = async () => {
                attempts++;
                try {
                    await whatsappService.start({ allowPairingOnAuthFailure: false });
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
            ctx.ui.notify('WhatsApp: Use Connect / Reconnect WhatsApp. QR code will appear only if pairing is needed.', 'info');
        }

        ctx.ui.notify('WhatsApp: Session reset via /new is now fully supported.', 'info');

        // Verify pdftotext availability for document support
        try {
            const { code } = await pi.exec('pdftotext', ['-v']);
            if (code !== 0 && code !== 99) { // 99 is a common exit code for -v in some versions
                throw new Error(`pdftotext returned code ${code}`);
            }
        } catch (e) {
            ctx.ui.notify('WhatsApp: pdftotext not found. PDF document support will be limited to storage only.', 'warning');
            logger.warn('[WhatsApp-Pi] Warning: pdftotext not found in system PATH.');
        }
    });

    // Track whether send_wa_message tool already sent a reply this turn
    let toolSentToJid: string | null = null;

    // Handle incoming messages by injecting them as user prompts
    whatsappService.setMessageCallback(async (m) => {
        const msg = m.messages[0];
        if (!msg.message) return;

        const remoteJid = msg.key.remoteJid;
        const isGroup = remoteJid?.endsWith('@g.us') || false;
        const participant = isGroup ? (msg.key.participant?.split('@')[0] || 'unknown') : (remoteJid?.split('@')[0] || 'unknown');
        const sender = remoteJid?.split('@')[0] || "unknown";
        const pushName = msg.pushName || "WhatsApp User";

        // Mark as read and start typing indicator immediately
        if (remoteJid && msg.key.id) {
            whatsappService.markRead(remoteJid, msg.key.id, msg.key.fromMe);
            whatsappService.sendPresence(remoteJid, 'composing');
        }

        // Reset tool-sent flag for this new incoming message
        toolSentToJid = null;

        const resolved = extractIncomingText(msg.message);
        if (resolved.kind === 'system') {
            logger.log(`[WhatsApp-Pi] ${pushName} (${sender}): ${resolved.text}`);
            return;
        }

        const { text, imageBuffer, imageMimeType } = await incomingMediaService.process(resolved, pushName);

        // Format message header with group context when applicable
        const messageHeader = isGroup
            ? `Message from ${pushName} (${participant}) in group ${remoteJid}:`
            : `Message from ${pushName} (${sender}):`;

        logger.log(`[WhatsApp-Pi] ${messageHeader} ${text}`);

        // Use a standard delivery for ALL messages to ensure TUI consistency
        if (imageBuffer && imageMimeType) {
            pi.sendUserMessage([
                { type: "text", text: `${messageHeader} ${text}` },
                { type: "image", data: imageBuffer.toString('base64'), mimeType: imageMimeType }
            ], { deliverAs: "followUp" });
        } else {
            pi.sendUserMessage(`${messageHeader} ${text}`, { deliverAs: "followUp" });
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
        description: "Send a WhatsApp message to a contact or group. The 'jid' parameter is the WhatsApp JID (e.g. 5511999998888@s.whatsapp.net for contacts, or 120363012345@g.us for groups). If omitted, replies to the last conversation.",
        promptSnippet: "send_wa_message(jid, message) - Send a WhatsApp message. jid is required (e.g. 5511999998888@s.whatsapp.net or 120363012345@g.us). IMPORTANT: After calling this tool, do NOT generate any follow-up text or confirmation — the message is already delivered to WhatsApp. Your entire response to the user should be sent ONLY through this tool, not repeated in chat.",
        parameters: Type.Object({
            jid: Type.Optional(Type.String({ description: "WhatsApp JID of the recipient" })),
            recipient_jid: Type.Optional(Type.String({ description: "Alternative name for jid" })),
            message: Type.String({ minLength: 1, description: "Plain-text message content to send" })
        }),
        async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
            // Resolve JID: jid > recipient_jid > lastRemoteJid
            const resolvedJid = params.jid || params.recipient_jid || whatsappService.getLastRemoteJid();
            if (!resolvedJid) {
                return {
                    isError: true,
                    details: undefined,
                    content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: "No JID provided and no active conversation to reply to", attempts: 0 }) }]
                };
            }

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
                `  To: ${resolvedJid}`,
                '  Message:',
                formattedMessage
            ].join('\n'));

            const result = await whatsappService.sendMessage(resolvedJid, params.message);

            if (result.success) {
                // Mark that tool already sent to this JID — prevents message_end from re-sending
                toolSentToJid = resolvedJid;
                const isGroupJid = resolvedJid.endsWith('@g.us');
                const senderNumber = isGroupJid ? resolvedJid : `+${resolvedJid.split('@')[0]}`;
                await recentsService.recordMessage({
                    messageId: result.messageId!,
                    senderNumber,
                    text: params.message,
                    direction: 'outgoing',
                    timestamp: Date.now()
                });
                console.log([
                    '[WhatsApp-Pi] Outgoing WhatsApp message result',
                    `  To: ${resolvedJid}`,
                    '  Status: sent',
                    `  MessageId: ${result.messageId ?? 'unknown'}`
                ].join('\n'));
            } else {
                console.log([
                    '[WhatsApp-Pi] Outgoing WhatsApp message result',
                    `  To: ${resolvedJid}`,
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

    // Suppress automatic message_end reply when tool already sent
    // This is checked by the message_end handler below

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

            // Skip if send_wa_message tool already sent a reply to this JID
            if (toolSentToJid === lastJid) {
                toolSentToJid = null;
                return;
            }

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
                } catch (error) {
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
