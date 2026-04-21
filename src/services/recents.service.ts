import { homedir } from 'os';
import { join } from 'path';
import { mkdir, readFile, writeFile } from 'fs/promises';
import type {
    MessageDirection,
    RecentConversationMessage,
    RecentConversationSummary,
    RecentsStore
} from '../models/whatsapp.types.js';
import { SessionManager } from './session.manager.js';

export interface RecentsMessageInput {
    messageId: string;
    senderNumber: string;
    senderName?: string;
    text: string;
    direction: MessageDirection;
    timestamp: number;
}

export class RecentsService {
    private readonly baseDir = join(homedir(), '.pi', 'whatsapp-pi');
    private readonly dataDir = join(this.baseDir, 'recents');
    private readonly storePath = join(this.dataDir, 'recents.json');
    private store: RecentsStore = {
        conversations: [],
        messagesBySender: {},
        updatedAt: Date.now()
    };

    constructor(private readonly sessionManager: SessionManager) {}

    async ensureInitialized() {
        await mkdir(this.dataDir, { recursive: true });
        await this.loadStore();
    }

    private async loadStore() {
        try {
            const content = await readFile(this.storePath, 'utf-8');
            const parsed = JSON.parse(content) as Partial<RecentsStore>;

            this.store = {
                conversations: Array.isArray(parsed.conversations) ? parsed.conversations.slice(0, 20) : [],
                messagesBySender: parsed.messagesBySender && typeof parsed.messagesBySender === 'object'
                    ? this.normalizeMessagesMap(parsed.messagesBySender)
                    : {},
                updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now()
            };

            this.rebuildConversationState();
        } catch {
            this.store = {
                conversations: [],
                messagesBySender: {},
                updatedAt: Date.now()
            };
        }
    }

    private normalizeMessagesMap(messagesBySender: RecentsStore['messagesBySender']): RecentsStore['messagesBySender'] {
        const normalized: RecentsStore['messagesBySender'] = {};

        for (const [senderNumber, messages] of Object.entries(messagesBySender)) {
            if (!Array.isArray(messages)) continue;
            normalized[senderNumber] = messages
                .filter((message): message is RecentConversationMessage => this.isValidMessage(message))
                .map(message => ({ ...message, timestamp: this.normalizeTimestamp(message.timestamp) }))
                .sort((left, right) => left.timestamp - right.timestamp)
                .slice(-20);
        }

        return normalized;
    }

    private isValidMessage(message: unknown): message is RecentConversationMessage {
        return Boolean(
            message &&
            typeof message === 'object' &&
            typeof (message as RecentConversationMessage).messageId === 'string' &&
            typeof (message as RecentConversationMessage).senderNumber === 'string' &&
            typeof (message as RecentConversationMessage).text === 'string' &&
            (message as RecentConversationMessage).text.trim().length > 0 &&
            ((message as RecentConversationMessage).direction === 'incoming' || (message as RecentConversationMessage).direction === 'outgoing') &&
            typeof (message as RecentConversationMessage).timestamp === 'number'
        );
    }

    private rebuildConversationState() {
        const previousNames = new Map(
            this.store.conversations.map(conversation => [conversation.senderNumber, conversation.senderName] as const)
        );
        const summaries = new Map<string, RecentConversationSummary>();

        for (const [senderNumber, messages] of Object.entries(this.store.messagesBySender)) {
            if (messages.length === 0) continue;
            const lastMessage = messages[messages.length - 1];
            summaries.set(senderNumber, {
                senderNumber,
                senderName: previousNames.get(senderNumber),
                lastMessagePreview: this.buildPreview(lastMessage.text),
                lastMessageTime: lastMessage.timestamp,
                lastMessageDirection: lastMessage.direction,
                messageCount: messages.length,
                isAllowed: this.sessionManager.isAllowed(senderNumber)
            });
        }

        this.store.conversations = Array.from(summaries.values())
            .sort((left, right) => right.lastMessageTime - left.lastMessageTime)
            .slice(0, 20);
    }

    private buildPreview(text: string): string {
        const normalized = text.trim().replace(/\s+/g, ' ');
        if (normalized.length <= 80) return normalized;
        return `${normalized.slice(0, 77)}...`;
    }

    private async persistStore() {
        this.store.updatedAt = Date.now();
        await writeFile(this.storePath, JSON.stringify(this.store, null, 2));
    }

    private normalizeNumber(input: string): string {
        // Group JIDs should be stored as-is
        if (input.endsWith('@g.us')) return input;
        const cleaned = input.replace(/@s\.whatsapp\.net$/, '');
        if (cleaned.startsWith('+')) {
            return cleaned;
        }
        if (/^\d+$/.test(cleaned)) {
            return `+${cleaned}`;
        }
        return cleaned;
    }

    private normalizeTimestamp(timestamp: number): number {
        return timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
    }

    async recordMessage(input: RecentsMessageInput) {
        const senderNumber = this.normalizeNumber(input.senderNumber);
        if (!senderNumber) return;

        const normalizedTimestamp = this.normalizeTimestamp(input.timestamp);
        const normalizedText = input.text.trim().replace(/\s+/g, ' ');
        if (!normalizedText) return;

        const existing = this.store.messagesBySender[senderNumber] ?? [];
        const nextMessage: RecentConversationMessage = {
            messageId: input.messageId,
            senderNumber,
            text: normalizedText,
            direction: input.direction,
            timestamp: normalizedTimestamp
        };

        const filtered = existing.filter(message => message.messageId !== nextMessage.messageId);
        filtered.push(nextMessage);

        this.store.messagesBySender[senderNumber] = filtered
            .sort((left, right) => left.timestamp - right.timestamp)
            .slice(-20);

        const existingConversation = this.store.conversations.find(conversation => conversation.senderNumber === senderNumber);
        const summary: RecentConversationSummary = {
            senderNumber,
            senderName: input.senderName ?? existingConversation?.senderName,
            lastMessagePreview: this.buildPreview(input.text),
            lastMessageTime: normalizedTimestamp,
            lastMessageDirection: input.direction,
            messageCount: this.store.messagesBySender[senderNumber].length,
            isAllowed: this.sessionManager.isAllowed(senderNumber)
        };

        this.store.conversations = [
            summary,
            ...this.store.conversations.filter(item => item.senderNumber !== senderNumber)
        ]
            .sort((left, right) => right.lastMessageTime - left.lastMessageTime)
            .slice(0, 20);

        await this.persistStore();
    }

    async getRecentConversations(): Promise<RecentConversationSummary[]> {
        this.rebuildConversationState();
        return [...this.store.conversations];
    }

    async getConversationHistory(senderNumber: string): Promise<RecentConversationMessage[]> {
        const normalizedNumber = this.normalizeNumber(senderNumber);
        const messages = this.store.messagesBySender[normalizedNumber] ?? [];
        return [...messages]
            .sort((left, right) => left.timestamp - right.timestamp)
            .slice(-20);
    }

    async hasRecentConversations(): Promise<boolean> {
        const conversations = await this.getRecentConversations();
        return conversations.length > 0;
    }
}
