import { extractMessageContent } from 'baileys';

export type IncomingResolution =
    | { kind: 'text'; text: string }
    | { kind: 'audio'; text: string; audioMessage: any }
    | { kind: 'image'; text: string; imageMessage: any }
    | { kind: 'document'; text: string; documentMessage: any }
    | { kind: 'contact'; text: string }
    | { kind: 'location'; text: string }
    | { kind: 'system'; text: string }
    | { kind: 'unsupported'; text: string };

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

const unwrapMessageContent = (content: any): any => extractMessageContent(content) ?? content;

const getTypeName = (payload: any): string => {
    if (!payload || typeof payload !== 'object') return 'unknown';
    return Object.keys(payload)[0] || 'unknown';
};

const formatProtocolMessage = (protocolMessage: any): string => {
    const typeLabel = protocolTypes[Number(protocolMessage?.type)] || 'System Update';
    const editedText = protocolMessage?.editedMessage?.conversation
        || protocolMessage?.editedMessage?.extendedTextMessage?.text;

    if (editedText) {
        return `[${typeLabel}: ${editedText}]`;
    }

    return `[${typeLabel}]`;
};

export const extractIncomingText = (message: any): IncomingResolution => {
    const content = unwrapMessageContent(message);
    const inner = content?.ephemeralMessage?.message
        || content?.viewOnceMessage?.message
        || content?.viewOnceMessageV2?.message
        || content?.viewOnceMessageV2Extension?.message
        || content?.message;

    const resolved = inner ? unwrapMessageContent(inner) : content;
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
