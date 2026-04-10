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
