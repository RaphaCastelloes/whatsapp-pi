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

export function validatePhoneNumber(number: string): boolean {
    return /^\+[1-9]\d{1,14}$/.test(number);
}
