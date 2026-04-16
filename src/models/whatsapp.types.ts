export type SessionStatus = 'logged-out' | 'pairing' | 'connected' | 'disconnected';

export interface WhatsAppSession {
    id: string;
    status: SessionStatus;
    credentialsPath: string;
}

export interface AllowList {
    numbers: string[];
}

export interface IncomingMessage {
    id: string;
    remoteJid: string;
    pushName?: string;
    text?: string;
    timestamp: number;
}

export interface MessageRequest {
    recipientJid: string;
    text: string;
    options?: {
        maxRetries?: number;
        priority?: 'high' | 'normal';
    };
}

export interface MessageResult {
    success: boolean;
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

export interface RecentsStore {
    conversations: RecentConversationSummary[];
    messagesBySender: Record<string, RecentConversationMessage[]>;
    updatedAt: number;
}

// QR Code Display Types
export interface QRCodeSession {
    id: string;
    qrData: string;
    expiresAt: Date;
    isActive: boolean;
    createdAt: Date;
    refreshCount: number;
}

export interface QRDisplayState {
    isDisplaying: boolean;
    currentSession?: QRCodeSession;
    lastInstruction: string;
    warningMessage?: string;
}

export enum PairingStatus {
    IDLE = 'idle',
    GENERATING_QR = 'generating',
    DISPLAYING_QR = 'displaying',
    SCANNING = 'scanning',
    CONNECTED = 'connected',
    FAILED = 'failed'
}

export type ExtendedSessionStatus = SessionStatus | 'pairing' | 'qr-expired';

export interface QRCodeDisplayOptions {
    terminalWidth?: number;
    refreshInterval: number;
    showInstructions: boolean;
    showExpirationWarning: boolean;
}

export class QRError extends Error {
    constructor(
        public code: string,
        message: string,
        public technical?: string,
        public recoverable: boolean = true
    ) {
        super(message);
        this.name = 'QRError';
        this.timestamp = new Date();
    }

    public timestamp: Date;
}

export enum QRErrorCode {
    TERMINAL_UNSUPPORTED = 'TERMINAL_UNSUPPORTED',
    QR_GENERATION_FAILED = 'QR_GENERATION_FAILED',
    DISPLAY_ERROR = 'DISPLAY_ERROR',
    CONNECTION_TIMEOUT = 'CONNECTION_TIMEOUT',
    NETWORK_ERROR = 'NETWORK_ERROR',
    INVALID_CREDENTIALS = 'INVALID_CREDENTIALS'
}
