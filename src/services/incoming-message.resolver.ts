import { t } from '../i18n.js';
import { extractMessageContent } from 'baileys';
import type { RecentsService } from './recents.service.js';

export interface QuotedMessageInfo {
    quotedText: string;
    quotedMessageId?: string;
    quotedParticipant?: string;
}

export interface OriginalMessageInfo {
    originalText: string;
    originalMessageId: string;
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
    | { kind: 'reaction'; text: string; reactionMessage: any; originalMessage?: OriginalMessageInfo }
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
    
    if (quotedMessage.contactMessage) {
        const displayName = quotedMessage.contactMessage.displayName;
        const vcard = quotedMessage.contactMessage.vcard;
        
        if (displayName) {
            return t('incoming.quoted.contactWithName', { name: displayName });
        }
        
        if (vcard) {
            const parsed = parseVCard(vcard);
            if (parsed.name) {
                return t('incoming.quoted.contactWithName', { name: parsed.name });
            }
        }
        
        return t('incoming.quoted.contact');
    }
    
    if (quotedMessage.contactsArrayMessage) {
        const contacts = quotedMessage.contactsArrayMessage.contacts || [];
        if (contacts.length > 1) {
            return t('incoming.quoted.multipleContacts', { count: contacts.length });
        }
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

/**
 * Parses a vCard string to extract contact information.
 */
const parseVCard = (vcard: string): { name?: string; phones: string[] } => {
    const lines = vcard.split('\n');
    let name: string | undefined;
    const phones: string[] = [];
    
    for (const line of lines) {
        const trimmed = line.trim();
        
        // Extract name - prefer FN (Full Name) over N
        if (trimmed.startsWith('FN:')) {
            name = trimmed.substring(3).trim();
        } else if (!name && trimmed.startsWith('N:')) {
            // Parse N format: "N:Last;First;Middle;Prefix;Suffix"
            const parts = trimmed.substring(2).split(';');
            const firstName = parts[1]?.trim() || '';
            const lastName = parts[0]?.trim() || '';
            if (firstName || lastName) {
                name = `${firstName} ${lastName}`.trim();
            }
        }
        
        // Extract phone numbers
        if (trimmed.startsWith('TEL') || trimmed.includes('waid=')) {
            // Format: TEL;type=CELL;type=VOICE;waid=5511999998888:+55 11 99999-8888
            const colonIndex = trimmed.indexOf(':');
            if (colonIndex !== -1) {
                const phoneNumber = trimmed.substring(colonIndex + 1).trim();
                if (phoneNumber) {
                    phones.push(phoneNumber);
                }
            }
        }
    }
    
    return { name, phones };
};

/**
 * Formats contact message with name and phone numbers.
 */
const formatContactMessage = (contactMessage: any): string => {
    const displayName = contactMessage.displayName;
    const vcard = contactMessage.vcard;
    
    if (!vcard) {
        return displayName 
            ? t('incoming.contact.withName', { name: displayName })
            : t('incoming.media.contact');
    }
    
    const parsed = parseVCard(vcard);
    const name = parsed.name || displayName;
    
    if (!name && parsed.phones.length === 0) {
        return t('incoming.media.contact');
    }
    
    let text = name 
        ? t('incoming.contact.withName', { name })
        : t('incoming.media.contact');
    
    if (parsed.phones.length > 0) {
        text += `\n${t('incoming.contact.phone', { phone: parsed.phones[0] })}`;
        
        if (parsed.phones.length > 1) {
            for (let i = 1; i < parsed.phones.length; i++) {
                text += `\n${t('incoming.contact.additionalPhone', { phone: parsed.phones[i] })}`;
            }
        }
    }
    
    return text;
};

/**
 * Formats contacts array message.
 */
const formatContactsArrayMessage = (contactsArrayMessage: any): string => {
    const contacts = contactsArrayMessage.contacts || [];
    
    if (contacts.length === 0) {
        return t('incoming.media.contact');
    }
    
    if (contacts.length === 1) {
        return formatContactMessage(contacts[0]);
    }
    
    // Collect detailed info for each contact
    interface ContactInfo {
        name?: string;
        phones: string[];
    }
    
    const contactInfos: ContactInfo[] = [];
    const seenNames = new Set<string>();
    
    for (const contact of contacts) {
        const displayName = contact.displayName;
        const vcard = contact.vcard;
        
        let contactName: string | undefined;
        let phones: string[] = [];
        
        // Parse vCard to get both name and phones
        if (vcard) {
            const parsed = parseVCard(vcard);
            contactName = parsed.name || displayName;
            phones = parsed.phones;
        } else if (displayName) {
            contactName = displayName;
        }
        
        // Only add unique contacts (by name)
        if (contactName && !seenNames.has(contactName)) {
            seenNames.add(contactName);
            contactInfos.push({ name: contactName, phones });
        }
    }
    
    if (contactInfos.length === 0) {
        return t('incoming.contact.multiple', { count: contacts.length });
    }
    
    // Format header
    let text = t('incoming.contact.multipleHeader', { count: contactInfos.length });
    
    // Format each contact with their phone numbers
    for (let i = 0; i < contactInfos.length; i++) {
        const info = contactInfos[i];
        const contactNum = i + 1;
        
        text += `\n${contactNum}. ${info.name || t('incoming.contact.unnamed')}`;
        
        if (info.phones.length > 0) {
            text += ` - ${info.phones[0]}`;
            
            // Add additional phones if any
            for (let j = 1; j < info.phones.length; j++) {
                text += `, ${info.phones[j]}`;
            }
        }
    }
    
    return text;
};

/**
 * Parses a vCard string to extract contact information.
 */
const parseVCard = (vcard: string): { name?: string; phones: string[] } => {
    const lines = vcard.split('\n');
    let name: string | undefined;
    const phones: string[] = [];
    
    for (const line of lines) {
        const trimmed = line.trim();
        
        // Extract name - prefer FN (Full Name) over N
        if (trimmed.startsWith('FN:')) {
            name = trimmed.substring(3).trim();
        } else if (!name && trimmed.startsWith('N:')) {
            // Parse N format: "N:Last;First;Middle;Prefix;Suffix"
            const parts = trimmed.substring(2).split(';');
            const firstName = parts[1]?.trim() || '';
            const lastName = parts[0]?.trim() || '';
            if (firstName || lastName) {
                name = `${firstName} ${lastName}`.trim();
            }
        }
        
        // Extract phone numbers
        if (trimmed.startsWith('TEL') || trimmed.includes('waid=')) {
            // Format: TEL;type=CELL;type=VOICE;waid=5511999998888:+55 11 99999-8888
            const colonIndex = trimmed.indexOf(':');
            if (colonIndex !== -1) {
                const phoneNumber = trimmed.substring(colonIndex + 1).trim();
                if (phoneNumber) {
                    phones.push(phoneNumber);
                }
            }
        }
    }
    
    return { name, phones };
};

/**
 * Formats contact message with name and phone numbers.
 */
const formatContactMessage = (contactMessage: any): string => {
    const displayName = contactMessage.displayName;
    const vcard = contactMessage.vcard;
    
    if (!vcard) {
        return displayName 
            ? t('incoming.contact.withName', { name: displayName })
            : t('incoming.media.contact');
    }
    
    const parsed = parseVCard(vcard);
    const name = parsed.name || displayName;
    
    if (!name && parsed.phones.length === 0) {
        return t('incoming.media.contact');
    }
    
    let text = name 
        ? t('incoming.contact.withName', { name })
        : t('incoming.media.contact');
    
    if (parsed.phones.length > 0) {
        text += `\n${t('incoming.contact.phone', { phone: parsed.phones[0] })}`;
        
        if (parsed.phones.length > 1) {
            for (let i = 1; i < parsed.phones.length; i++) {
                text += `\n${t('incoming.contact.additionalPhone', { phone: parsed.phones[i] })}`;
            }
        }
    }
    
    return text;
};

/**
 * Formats contacts array message.
 */
const formatContactsArrayMessage = (contactsArrayMessage: any): string => {
    const contacts = contactsArrayMessage.contacts || [];
    
    if (contacts.length === 0) {
        return t('incoming.media.contact');
    }
    
    if (contacts.length === 1) {
        return formatContactMessage(contacts[0]);
    }
    
    // Collect detailed info for each contact
    interface ContactInfo {
        name?: string;
        phones: string[];
    }
    
    const contactInfos: ContactInfo[] = [];
    const seenNames = new Set<string>();
    
    for (const contact of contacts) {
        const displayName = contact.displayName;
        const vcard = contact.vcard;
        
        let contactName: string | undefined;
        let phones: string[] = [];
        
        // Parse vCard to get both name and phones
        if (vcard) {
            const parsed = parseVCard(vcard);
            contactName = parsed.name || displayName;
            phones = parsed.phones;
        } else if (displayName) {
            contactName = displayName;
        }
        
        // Only add unique contacts (by name)
        if (contactName && !seenNames.has(contactName)) {
            seenNames.add(contactName);
            contactInfos.push({ name: contactName, phones });
        }
    }
    
    if (contactInfos.length === 0) {
        return t('incoming.contact.multiple', { count: contacts.length });
    }
    
    // Format header
    let text = t('incoming.contact.multipleHeader', { count: contactInfos.length });
    
    // Format each contact with their phone numbers
    for (let i = 0; i < contactInfos.length; i++) {
        const info = contactInfos[i];
        const contactNum = i + 1;
        
        text += `\n${contactNum}. ${info.name || t('incoming.contact.unnamed')}`;
        
        if (info.phones.length > 0) {
            text += ` - ${info.phones[0]}`;
            
            // Add additional phones if any
            for (let j = 1; j < info.phones.length; j++) {
                text += `, ${info.phones[j]}`;
            }
        }
    }
    
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

export const extractIncomingText = (message: any, recentsService?: RecentsService): IncomingResolution => {
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

    if (resolved?.contactMessage) {
        return { 
            kind: 'contact', 
            text: formatContactMessage(resolved.contactMessage), 
            quotedMessage 
        };
    }

    if (resolved?.contactsArrayMessage) {
        return { 
            kind: 'contact', 
            text: formatContactsArrayMessage(resolved.contactsArrayMessage), 
            quotedMessage 
        };
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
        const reactionKey = resolved.reactionMessage.key;
        
        // Try to look up the original message from recents
        let originalMessage: OriginalMessageInfo | undefined;
        if (recentsService && reactionKey?.id) {
            console.log('[DEBUG] Looking for message ID:', reactionKey.id);
            const foundMessage = recentsService.findMessageById(reactionKey.id);
            console.log('[DEBUG] Found message:', foundMessage ? `"${foundMessage.text}"` : 'NOT FOUND');
            if (foundMessage) {
                originalMessage = {
                    originalText: foundMessage.text,
                    originalMessageId: foundMessage.messageId
                };
            }
        } else {
            console.log('[DEBUG] RecentsService or reactionKey.id not available:', { 
                hasRecentsService: !!recentsService, 
                reactionKeyId: reactionKey?.id 
            });
        }
        
        if (emoji) {
            const text = originalMessage
                ? t('incoming.media.reactionWithContext', { emoji, originalText: originalMessage.originalText })
                : t('incoming.media.reaction', { emoji });
            
            return {
                kind: 'reaction',
                text,
                reactionMessage: resolved.reactionMessage,
                originalMessage
            };
        }
        
        const text = originalMessage
            ? t('incoming.media.reactionRemovedWithContext', { originalText: originalMessage.originalText })
            : t('incoming.media.reactionRemoved');
        
        return {
            kind: 'reaction',
            text,
            reactionMessage: resolved.reactionMessage,
            originalMessage
        };
    }

    return { kind: 'unsupported', text: t('incoming.media.unsupported', { typeName }) };
};
