import type { proto, WAMessageKey } from 'baileys';
import type { IncomingProcessingState } from './whatsapp.types.js';

export interface ArchiveOptions {
    root: string;
    authProfile: string;
    legacyPath: string;
    maxRecords?: number;
    maxAgeMs?: number;
    maxBytes?: number;
    maxTombstones?: number;
    maxPending?: number;
}
export interface SafeMediaMetadata {
    kind: 'image' | 'document' | 'audio' | 'video';
    fileName?: string;
    mimetype?: string;
    voiceNote?: boolean;
    seconds?: number;
    size?: number;
}
export interface ArchivedMessage {
    key: WAMessageKey;
    canonicalChat?: string;
    text: string;
    timestamp: number;
    direction: 'incoming' | 'outgoing';
    senderName?: string;
    quotedMessageId?: string;
    quote?: proto.IMessage;
    media?: SafeMediaMetadata;
    expiresAt: number;
    status?: number;
    sendState?: 'accepted' | 'unknown' | 'failed';
    editedAt?: number;
    deleted?: 'remote' | 'local';
    receipts?: Record<string, { deliveredAt?: number; readAt?: number; playedAt?: number }>;
    reactions?: Record<string, { text: string; timestamp: number }>;
    incomplete?: boolean;
    legacySender?: string;
}
export interface LifecycleUpdate {
    key: WAMessageKey;
    status?: number;
    text?: string;
    editedAt?: number;
    deleted?: 'remote' | 'local';
    receipt?: { participant: string; deliveredAt?: number; readAt?: number; playedAt?: number };
    reaction?: { participant: string; text: string; timestamp: number };
}
export interface HistoryRequestRecord {
    id: string;
    chat: string;
    anchor: WAMessageKey;
    createdAt: number;
    status: 'pending' | 'partial' | 'complete' | 'unknown' | 'interrupted' | 'failed';
    count: number;
    imported: number;
    progress?: number;
    syncType?: number;
    chunkOrder?: number;
    explicit?: boolean;
}
export interface ArchiveSnapshot {
    version: 1;
    records: ArchivedMessage[];
    processing: Array<{ key: WAMessageKey; state: IncomingProcessingState | 'interrupted'; expiresAt: number }>;
    tombstones: Array<{ key: WAMessageKey; timestamp: number; observedAt: number; kind: 'remote' | 'local' }>;
    pending: Array<{ update: LifecycleUpdate; receivedAt: number }>;
    floors: Record<string, number>;
    accountFloor: number;
    requests: HistoryRequestRecord[];
    aliases: Array<{ lid: string; pn: string }>;
    conflicts: string[];
    incomplete: boolean;
}
export interface HistoryScope {
    id: string;
    profile: string;
    account?: string;
    readOnly: boolean;
}
export const emptyArchive = (): ArchiveSnapshot => ({ version: 1, records: [], processing: [], tombstones: [], pending: [], floors: {}, accountFloor: 0, requests: [], aliases: [], conflicts: [], incomplete: false });
