import { t } from '../i18n.js';
import { extractMessageContent } from 'baileys';

export type IncomingResolution =
    | { kind: 'text'; text: string }
    | { kind: 'audio'; text: string; audioMessage: any }
    | { kind: 'image'; text: string; imageMessage: any }
    | { kind: 'video'; text: string; videoMessage: any }
    | { kind: 'document'; text: string; documentMessage: any }
    | { kind: 'contact'; text: string }
    | { kind: 'location'; text: string }
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
            text: resolved.imageMessage.caption || t('incoming.media.image'),
            imageMessage: resolved.imageMessage
        };
    }

    if (resolved?.videoMessage) {
        return {
            kind: 'video',
            text: resolved.videoMessage.caption || t('incoming.media.video'),
            videoMessage: resolved.videoMessage
        };
    }

    if (resolved?.audioMessage) {
        return {
            kind: 'audio',
            text: t('incoming.media.audio'),
            audioMessage: resolved.audioMessage
        };
    }

    if (resolved?.documentMessage) {
        return {
            kind: 'document',
            text: resolved.documentMessage.caption || t('incoming.media.document'),
            documentMessage: resolved.documentMessage
        };
    }

    if (resolved?.contactMessage || resolved?.contactsArrayMessage) {
        return { kind: 'contact', text: t('incoming.media.contact') };
    }

    if (resolved?.locationMessage) {
        return { kind: 'location', text: t('incoming.media.location') };
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
