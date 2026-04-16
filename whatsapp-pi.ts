import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { extractMessageContent } from '@whiskeysockets/baileys';
import { SessionManager } from './src/services/session.manager.js';
import { WhatsAppService } from './src/services/whatsapp.service.js';
import { MenuHandler } from './src/ui/menu.handler.js';
import { RecentsService } from './src/services/recents.service.js';
import { AudioService } from './src/services/audio.service.js';
import { join } from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';

console.log("[WhatsApp-Pi] Extension file loaded by Pi...");

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
                console.error(`[WhatsApp-Pi] Graceful shutdown failed during ${reason}:`, error);
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

        if (isVerbose) {
            console.log('[WhatsApp-Pi] Verbose mode enabled - Baileys trace logs will be shown');
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

        if (savedStateEntry) {
            const data = (savedStateEntry as { data?: any }).data;
            if (data.status) await sessionManager.setStatus(data.status);
            if (Array.isArray(data.allowList)) {
                for (const n of data.allowList) {
                    const num = typeof n === "string" ? n : n.number;
                    const name = typeof n === "string" ? undefined : n.name;
                    await sessionManager.addNumber(num, name);
                }
            }
        }

        // Check whatsapp flag — only auto-connect on initial startup, not reloads/new sessions
        const isWhatsappPiOn = event.reason === "startup" && pi.getFlag("whatsapp-pi-online") === true;
        const registered = await sessionManager.isRegistered();

        if (isWhatsappPiOn && registered) {
            ctx.ui.setStatus('whatsapp', '| WhatsApp: Auto-connecting...');

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
            console.warn('[WhatsApp-Pi] Warning: pdftotext not found in system PATH.');
        }
    });



    type IncomingResolution =
        | { kind: 'text'; text: string }
        | { kind: 'audio'; text: string; audioMessage: any }
        | { kind: 'image'; text: string; imageMessage: any }
        | { kind: 'document'; text: string; documentMessage: any }
        | { kind: 'contact'; text: string }
        | { kind: 'location'; text: string }
        | { kind: 'system'; text: string }
        | { kind: 'unsupported'; text: string };

    const extractIncomingText = (message: any, pushName: string): IncomingResolution => {
        const unwrap = (content: any): any => extractMessageContent(content) ?? content;
        const content = unwrap(message);

        const getTypeName = (payload: any): string => {
            if (!payload || typeof payload !== 'object') return 'unknown';
            const keys = Object.keys(payload);
            return keys[0] || 'unknown';
        };

        const formatProtocolMessage = (protocolMessage: any): string => {
            const protocolTypes: Record<number, string> = {
                0: 'Message Deleted',
                3: 'Disappearing Messages Updated',
                4: 'Disappearing Message Sync Response',
                5: 'History Sync Notification',
                6: 'App State Sync Key Share',
                7: 'App State Sync Key Request',
                8: 'Message Backfill Request',
                9: 'Security Notification Sync',
                10: 'Fatal App State Sync Notification',
                11: 'Phone Number Shared',
                14: 'Message Edited',
                16: 'Peer Data Request',
                17: 'Peer Data Response',
                18: 'Welcome Message Request',
                19: 'Bot Feedback',
                20: 'Media Notification'
            };

            const typeLabel = protocolTypes[Number(protocolMessage?.type)] || 'System Update';
            if (protocolMessage?.editedMessage?.conversation || protocolMessage?.editedMessage?.extendedTextMessage?.text) {
                const editedText = protocolMessage.editedMessage.conversation
                    || protocolMessage.editedMessage.extendedTextMessage?.text
                    || '[Edited message]';
                return `[${typeLabel}: ${editedText}]`;
            }

            return `[${typeLabel}]`;
        };

        const inner = content?.ephemeralMessage?.message
            || content?.viewOnceMessage?.message
            || content?.viewOnceMessageV2?.message
            || content?.viewOnceMessageV2Extension?.message
            || content?.message;

        const resolved = inner ? unwrap(inner) : content;
        const typeName = getTypeName(resolved);
        const protocolMessage = resolved?.protocolMessage
            || (typeName === 'protocolMessage' ? resolved : undefined)
            || content?.protocolMessage;

        if (protocolMessage) {
            return { kind: 'system', text: formatProtocolMessage(protocolMessage) };
        }

        if (resolved?.conversation) {
            return { kind: 'text', text: resolved.conversation };
        }

        if (resolved?.extendedTextMessage?.text) {
            return { kind: 'text', text: resolved.extendedTextMessage.text };
        }

        if (resolved?.imageMessage) {
            return {
                kind: 'image',
                text: resolved.imageMessage.caption || '[Image]',
                imageMessage: resolved.imageMessage
            };
        }

        if (resolved?.videoMessage) {
            return {
                kind: 'text',
                text: resolved.videoMessage.caption || '[Video]'
            };
        }

        if (resolved?.audioMessage) {
            return {
                kind: 'audio',
                text: '[Audio Message]',
                audioMessage: resolved.audioMessage
            };
        }

        if (resolved?.documentMessage) {
            return {
                kind: 'document',
                text: resolved.documentMessage.caption || '[Document]',
                documentMessage: resolved.documentMessage
            };
        }

        if (resolved?.contactMessage || resolved?.contactsArrayMessage) {
            return { kind: 'contact', text: '[Contact]' };
        }

        if (resolved?.locationMessage) {
            return { kind: 'location', text: '[Location]' };
        }

        if (resolved?.buttonsResponseMessage?.selectedDisplayText) {
            return { kind: 'text', text: resolved.buttonsResponseMessage.selectedDisplayText };
        }

        if (resolved?.listResponseMessage?.title) {
            return { kind: 'text', text: resolved.listResponseMessage.title };
        }

        if (resolved?.templateButtonReplyMessage?.selectedDisplayText) {
            return { kind: 'text', text: resolved.templateButtonReplyMessage.selectedDisplayText };
        }

        return { kind: 'unsupported', text: `[Unsupported Message Type: ${typeName}]` };
    };

    // Handle incoming messages by injecting them as user prompts
    whatsappService.setMessageCallback(async (m) => {
        const msg = m.messages[0];
        if (!msg.message) return;

        const sender = msg.key.remoteJid?.split('@')[0] || "unknown";
        const pushName = msg.pushName || "WhatsApp User";

        // Mark as read and start typing indicator immediately
        const remoteJid = msg.key.remoteJid;
        if (remoteJid && msg.key.id) {
            whatsappService.markRead(remoteJid, msg.key.id, msg.key.fromMe);
            whatsappService.sendPresence(remoteJid, 'composing');
        }

        const resolved = extractIncomingText(msg.message, pushName);
        if (resolved.kind === 'system') {
            console.log(`[WhatsApp-Pi] ${pushName} (${sender}): ${resolved.text}`);
            return;
        }

        let text = resolved.text;

        // Handle media types
        let imageBuffer: Buffer | undefined;
        let imageMimeType: string | undefined;

        if (resolved.kind === 'audio') {
            console.log(`[WhatsApp-Pi] Transcribing audio from ${pushName}...`);
            const transcription = await audioService.transcribe(resolved.audioMessage);
            text = `[Transcribed Audio]: ${transcription}`;
        } else if (resolved.kind === 'image') {
            console.log(`[WhatsApp-Pi] Downloading image from ${pushName}...`);
            try {
                const { downloadContentFromMessage } = await import('@whiskeysockets/baileys');
                const stream = await downloadContentFromMessage(resolved.imageMessage, 'image');
                let buffer = Buffer.from([]);
                for await (const chunk of stream) {
                    buffer = Buffer.concat([buffer, chunk]);
                }
                imageBuffer = buffer;

                // Normalize mime type for Cloud Code Assist / Gemini
                let rawMime = resolved.imageMessage.mimetype || 'image/jpeg';
                imageMimeType = rawMime.toLowerCase().split(';')[0].trim();
                if (imageMimeType === 'image/jpg') imageMimeType = 'image/jpeg';

                console.log(`[WhatsApp-Pi] Image downloaded. MIME: ${imageMimeType} (original: ${rawMime}), Size: ${imageBuffer.length} bytes`);

                text = resolved.text || "[Image]";
            } catch (e) {
                console.error(`[WhatsApp-Pi] Failed to download image:`, e);
                text = "[Image (download failed)]";
            }
        } else if (resolved.kind === 'document') {
            const doc = resolved.documentMessage;
            const fileName = doc.fileName || 'unnamed_document';
            const mimeType = doc.mimetype || 'application/octet-stream';
            const fileSize = doc.fileLength ? Number(doc.fileLength) : 0;

            console.log(`[WhatsApp-Pi] Downloading document from ${pushName}: ${fileName}...`);

            try {
                const { downloadContentFromMessage } = await import('@whiskeysockets/baileys');
                const stream = await downloadContentFromMessage(doc, 'document');
                let buffer = Buffer.from([]);
                for await (const chunk of stream) {
                    buffer = Buffer.concat([buffer, chunk]);
                }

                // Sanitize filename
                const sanitized = fileName.replace(/[^a-z0-9\._-]/gi, '_');
                const savedFileName = `${Date.now()}_${sanitized}`;
                const relativePath = `./.pi-data/whatsapp/documents/${savedFileName}`;
                const absolutePath = join(process.cwd(), '.pi-data', 'whatsapp', 'documents', savedFileName);

                // Ensure directory exists (T001 handles it at startup, but let's be safe)
                await mkdir(join(process.cwd(), '.pi-data', 'whatsapp', 'documents'), { recursive: true });
                await writeFile(absolutePath, buffer);

                console.log(`[WhatsApp-Pi] Document saved to ${relativePath} (${buffer.length} bytes)`);

                const sizeFormatted = fileSize > 1024 * 1024
                    ? `${(fileSize / (1024 * 1024)).toFixed(1)} MB`
                    : `${(fileSize / 1024).toFixed(1)} KB`;

                text = `[Document Received: ${fileName}]\n` +
                    `MIME Type: ${mimeType}\n` +
                    `Size: ${sizeFormatted}\n` +
                    `Location: ${relativePath}`;

                if (doc.caption) {
                    text += `\n\nDescription: ${doc.caption}`;
                }
            } catch (e) {
                console.error(`[WhatsApp-Pi] Failed to download document:`, e);
                text = `[Document: ${fileName} (download failed)]`;
            }
        } else if (resolved.kind === 'contact') {
            text = resolved.text;
        } else if (resolved.kind === 'location') {
            text = resolved.text;
        } else if (resolved.kind === 'unsupported') {
            text = resolved.text;
        }

        // Always log to console so it appears in the TUI log pane
        console.log(`[WhatsApp-Pi] ${pushName} (${sender}): ${text}`);

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
            console.log(`[WhatsApp-Pi] Session compact requested by ${pushName}.`);

            if (_ctx) {
                _ctx.compact();
                await whatsappService.sendMessage(remoteJid!, "Session compacted successfully! ✅");
            }
            return;
        }

        if (text.trim().toLowerCase().startsWith('/abort')) {
            console.log(`[WhatsApp-Pi] Abort requested by ${pushName}.`);
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

            const result = await whatsappService.sendMessage(params.jid, params.message);

            if (result.success) {
                await recentsService.recordMessage({
                    messageId: result.messageId!,
                    senderNumber: `+${params.jid.split('@')[0]}`,
                    text: params.message,
                    direction: 'outgoing',
                    timestamp: Date.now()
                });
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
