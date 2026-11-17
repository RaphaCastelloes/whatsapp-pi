import type { WAMessage, WAMessageKey, AnyMessageContent, MiscMessageGenerationOptions } from 'baileys';

export type SessionStatus = 'logged-out' | 'pairing' | 'connected' | 'disconnected';

export type IncomingProcessingState = 'reserved' | 'prepared' | 'handed-off' | 'consumed' | 'failed' | 'interrupted';

export interface WhatsAppSessionContext {
    readonly accountScope: string;
    readonly generation: number;
}

export type IncomingMessageEnvelope = Pick<WAMessage, 'message' | 'pushName' | 'messageTimestamp'> & {
    key: WAMessageKey & { id: string; remoteJid: string };
    senderNumber: string;
    sessionContext: WhatsAppSessionContext;
};

export interface WhatsAppSession {
    id: string;
    status: SessionStatus;
    credentialsPath: string;
}

export interface AllowList {
    numbers: string[];
}

export interface QuotedMessageInfo {
    quotedText: string;
    quotedMessageId?: string;
    quotedParticipant?: string;
}

export interface IncomingMessage {
    id: string;
    remoteJid: string;
    senderNumber?: string;
    pushName?: string;
    text?: string;
    timestamp: number;
    quotedMessage?: QuotedMessageInfo;
}

export interface QuoteTarget {
    scope?: string;
    messageId: string;
    conversationJid?: string;
    fromMe?: boolean;
    participant?: string;
}

export interface TextSendOptions {
    quote?: QuoteTarget;
    signal?: AbortSignal;
    onSettled?: (result: MessageResult) => void | Promise<void>;
}

export interface MessageRequest {
    recipientJid: string;
    text: string;
    content?: AnyMessageContent;
    quote?: QuoteTarget;
    sendOptions?: MiscMessageGenerationOptions;
    sessionContext?: WhatsAppSessionContext;
    signal?: AbortSignal;
    sendTimeoutMs?: number;
    onSettled?: (result: MessageResult) => void | Promise<void>;
    options?: {
        brand?: boolean;
        maxRetries?: number;
        priority?: 'high' | 'normal';
    };
}

export interface MessageResult {
    success: boolean;
    delivery?: 'unknown';
    messageId?: string;
    error?: string;
    attempts: number;
}

export class WhatsAppError extends Error {
    constructor(public code: string, message: string) {
        super(message);
        this.name = 'WhatsAppError';
    }
}

export function validatePhoneNumber(number: string): boolean {
    return /^\+[1-9]\d{1,14}$/.test(number);
}

export interface DocumentMetadata {
    filename: string;
    mimetype: string;
    size: number;
    savedPath: string;
    timestamp: number;
}

export type MessageDirection = 'incoming' | 'outgoing';

export interface RecentConversationMessage {
    media?: import('./message-archive.types.js').SafeMediaMetadata;
    historyScope?: string;
    quoteAvailable?: boolean;
    key?: WAMessageKey;
    status?: number;
    sendState?: 'accepted' | 'unknown' | 'failed';
    editedAt?: number;
    deleted?: 'remote' | 'local';
    receipts?: Record<string, { deliveredAt?: number; readAt?: number; playedAt?: number }>;
    reactions?: Record<string, { text: string; timestamp: number }>;
    incomplete?: boolean;
    quotedMessageId?: string;
    messageId: string;
    senderNumber: string;
    text: string;
    direction: MessageDirection;
    timestamp: number;
}

export interface RecentConversationSummary {
    senderNumber: string;
    senderName?: string;
    lastMessagePreview: string;
    lastMessageTime: number;
    lastMessageDirection: MessageDirection;
    messageCount: number;
    isAllowed: boolean;
}

export interface SelectedMessageContext extends RecentConversationMessage {
    quoteAvailable?: boolean;
    messageId: string;
    senderNumber: string;
    senderName?: string;
    text: string;
    direction: MessageDirection;
    timestamp: number;
}

export interface ReplyDraft {
    text: string;
    targetMessageId: string;
    targetConversation: string;
}

export interface ReplySendResult {
    success: boolean;
    messageId?: string;
    error?: string;
    attempts: number;
}

export interface RecentsStore {
    conversations: RecentConversationSummary[];
    messagesBySender: Record<string, RecentConversationMessage[]>;
    updatedAt: number;
}
