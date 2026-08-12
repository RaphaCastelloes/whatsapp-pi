import { t } from '../i18n.js';
import { extractMessageContent } from 'baileys';

export interface QuotedMessageInfo {
    quotedText: string;
    quotedMessageId?: string;
    quotedParticipant?: string;
}

export type IncomingResolution =
    | { kind: 'text'; text: string; quotedMessage?: QuotedMessageInfo }
    | { kind: 'audio'; text: string; audioMessage: any; quotedMessage?: QuotedMessageInfo }
    | { kind: 'image'; text: string; imageMessage: any; quotedMessage?: QuotedMessageInfo }
    | { kind: 'video'; text: string; videoMessage: any; quotedMessage?: QuotedMessageInfo }
    | { kind: 'document'; text: string; documentMessage: any; quotedMessage?: QuotedMessageInfo }
    | { kind: 'contact'; text: string; quotedMessage?: QuotedMessageInfo }
    | { kind: 'location'; text: string; quotedMessage?: QuotedMessageInfo }
    | { kind: 'system'; text: string }
    | { kind: 'reaction'; text: string; reactionMessage: any }
    | { kind: 'unsupported'; text: string };

const protocolTypes: Record<number, keyof typeof protocolLabels> = {
    0: 'messageDeleted',
    3: 'disappearingMessagesUpdated',
    4: 'disappearingMessageSyncResponse',
    5: 'historySyncNotification',
    6: 'appStateSyncKeyShare',
    7: 'appStateSyncKeyRequest',
    8: 'messageBackfillRequest',
    9: 'securityNotificationSync',
    10: 'fatalAppStateSyncNotification',
    11: 'phoneNumberShared',
    14: 'messageEdited',
    16: 'peerDataRequest',
    17: 'peerDataResponse',
    18: 'welcomeMessageRequest',
    19: 'botFeedback',
    20: 'mediaNotification'
};

const protocolLabels = {
    messageDeleted: t('incoming.protocol.messageDeleted'),
    disappearingMessagesUpdated: t('incoming.protocol.disappearingMessagesUpdated'),
    disappearingMessageSyncResponse: t('incoming.protocol.disappearingMessageSyncResponse'),
    historySyncNotification: t('incoming.protocol.historySyncNotification'),
    appStateSyncKeyShare: t('incoming.protocol.appStateSyncKeyShare'),
    appStateSyncKeyRequest: t('incoming.protocol.appStateSyncKeyRequest'),
    messageBackfillRequest: t('incoming.protocol.messageBackfillRequest'),
    securityNotificationSync: t('incoming.protocol.securityNotificationSync'),
    fatalAppStateSyncNotification: t('incoming.protocol.fatalAppStateSyncNotification'),
    phoneNumberShared: t('incoming.protocol.phoneNumberShared'),
    messageEdited: t('incoming.protocol.messageEdited'),
    peerDataRequest: t('incoming.protocol.peerDataRequest'),
    peerDataResponse: t('incoming.protocol.peerDataResponse'),
    welcomeMessageRequest: t('incoming.protocol.welcomeMessageRequest'),
    botFeedback: t('incoming.protocol.botFeedback'),
    mediaNotification: t('incoming.protocol.mediaNotification')
} as const;

const unwrapMessageContent = (content: any): any => extractMessageContent(content) ?? content;

const getTypeName = (payload: any): string => {
    if (!payload || typeof payload !== 'object') return 'unknown';
    return Object.keys(payload)[0] || 'unknown';
};

/**
 * Extracts contextInfo from various message types.
 * Baileys stores contextInfo in different locations depending on message type.
 */
const extractContextInfo = (resolved: any): any => {
    return resolved?.extendedTextMessage?.contextInfo
        || resolved?.imageMessage?.contextInfo
        || resolved?.videoMessage?.contextInfo
        || resolved?.audioMessage?.contextInfo
        || resolved?.documentMessage?.contextInfo
        || resolved?.stickerMessage?.contextInfo
        || resolved?.buttonsMessage?.contextInfo
        || resolved?.templateMessage?.contextInfo;
};

/**
 * Extracts text from a quoted message.
 * Handles various message types that can be quoted.
 */
const extractQuotedText = (quotedMessage: any): string => {
    if (!quotedMessage) return '';
    
    // Try to extract text from various message types
    if (quotedMessage.conversation) {
        return quotedMessage.conversation;
    }
    
    if (quotedMessage.extendedTextMessage?.text) {
        return quotedMessage.extendedTextMessage.text;
    }
    
    if (quotedMessage.imageMessage) {
        return quotedMessage.imageMessage.caption || t('incoming.quoted.image');
    }
    
    if (quotedMessage.videoMessage) {
        return quotedMessage.videoMessage.caption || t('incoming.quoted.video');
    }
    
    if (quotedMessage.documentMessage) {
        return quotedMessage.documentMessage.caption || t('incoming.quoted.document');
    }
    
    if (quotedMessage.audioMessage) {
        return t('incoming.quoted.audio');
    }
    
    if (quotedMessage.contactMessage || quotedMessage.contactsArrayMessage) {
        return t('incoming.quoted.contact');
    }
    
    if (quotedMessage.locationMessage) {
        const lat = quotedMessage.locationMessage.degreesLatitude;
        const lng = quotedMessage.locationMessage.degreesLongitude;
        const name = quotedMessage.locationMessage.name;
        
        if (lat !== undefined && lng !== undefined) {
            if (name) {
                return t('incoming.quoted.locationWithName', { name, lat, lng });
            }
            return t('incoming.quoted.locationWithCoords', { lat, lng });
        }
        return t('incoming.quoted.location');
    }
    
    return t('incoming.quoted.message');
};

/**
 * Extracts quote information from contextInfo.
 * Returns null if no quote is present.
 */
const extractQuoteInfo = (contextInfo: any): QuotedMessageInfo | undefined => {
    if (!contextInfo?.quotedMessage) {
        return undefined;
    }
    
    const quotedText = extractQuotedText(contextInfo.quotedMessage);
    
    return {
        quotedText,
        quotedMessageId: contextInfo.stanzaId,
        quotedParticipant: contextInfo.participant
    };
};

/**
 * Formats location message with coordinates and optional name/address.
 */
const formatLocationMessage = (locationMessage: any): string => {
    const lat = locationMessage.degreesLatitude;
    const lng = locationMessage.degreesLongitude;
    const name = locationMessage.name;
    const address = locationMessage.address;
    
    if (lat === undefined || lng === undefined) {
        return t('incoming.media.location');
    }
    
    let text = t('incoming.location.coordinates', { lat, lng });
    
    if (name) {
        text += `\n${t('incoming.location.name', { name })}`;
    }
    
    if (address) {
        text += `\n${t('incoming.location.address', { address })}`;
    }
    
    text += `\n${t('incoming.location.googleMapsLink', { lat, lng })}`;
    
    return text;
};

const formatProtocolMessage = (protocolMessage: any): string => {
    const typeLabelKey = protocolTypes[Number(protocolMessage?.type)];
    const typeLabel = typeLabelKey ? protocolLabels[typeLabelKey] : t('incoming.protocol.systemUpdate');
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

    // Extract quote information from contextInfo
    const contextInfo = extractContextInfo(resolved);
    const quotedMessage = extractQuoteInfo(contextInfo);

    if (protocolMessage) {
        return { kind: 'system', text: formatProtocolMessage(protocolMessage) };
    }

    if (resolved?.conversation) {
        return { kind: 'text', text: resolved.conversation, quotedMessage };
    }

    if (resolved?.extendedTextMessage?.text) {
        return { kind: 'text', text: resolved.extendedTextMessage.text, quotedMessage };
    }

    if (resolved?.imageMessage) {
        return {
            kind: 'image',
            text: resolved.imageMessage.caption || t('incoming.media.image'),
            imageMessage: resolved.imageMessage,
            quotedMessage
        };
    }

    if (resolved?.videoMessage) {
        return {
            kind: 'video',
            text: resolved.videoMessage.caption || t('incoming.media.video'),
            videoMessage: resolved.videoMessage,
            quotedMessage
        };
    }

    if (resolved?.audioMessage) {
        return {
            kind: 'audio',
            text: t('incoming.media.audio'),
            audioMessage: resolved.audioMessage,
            quotedMessage
        };
    }

    if (resolved?.documentMessage) {
        return {
            kind: 'document',
            text: resolved.documentMessage.caption || t('incoming.media.document'),
            documentMessage: resolved.documentMessage,
            quotedMessage
        };
    }

    if (resolved?.contactMessage || resolved?.contactsArrayMessage) {
        return { kind: 'contact', text: t('incoming.media.contact'), quotedMessage };
    }

    if (resolved?.locationMessage) {
        return { 
            kind: 'location', 
            text: formatLocationMessage(resolved.locationMessage), 
            quotedMessage 
        };
    }

    if (resolved?.buttonsResponseMessage?.selectedDisplayText) {
        return { kind: 'text', text: resolved.buttonsResponseMessage.selectedDisplayText, quotedMessage };
    }

    if (resolved?.listResponseMessage?.title) {
        return { kind: 'text', text: resolved.listResponseMessage.title, quotedMessage };
    }

    if (resolved?.templateButtonReplyMessage?.selectedDisplayText) {
        return { kind: 'text', text: resolved.templateButtonReplyMessage.selectedDisplayText, quotedMessage };
    }

    if (resolved?.reactionMessage) {
        const emoji = resolved.reactionMessage.text;
        if (emoji) {
            return {
                kind: 'reaction',
                text: t('incoming.media.reaction', { emoji }),
                reactionMessage: resolved.reactionMessage
            };
        }
        return {
            kind: 'reaction',
            text: t('incoming.media.reactionRemoved'),
            reactionMessage: resolved.reactionMessage
        };
    }

    return { kind: 'unsupported', text: t('incoming.media.unsupported', { typeName }) };
};
