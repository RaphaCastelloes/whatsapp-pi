import { readFile, writeFile } from 'fs/promises';
import { createStoragePaths, ensureStorageDirectories as ensureStorageRoots, migrateLegacyStorage } from './storage-path.js';
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
    private readonly storagePaths = createStoragePaths();
    private readonly dataDir = this.storagePaths.recentsDir;
    private readonly storePath = this.storagePaths.recentsPath;
    private store: RecentsStore = {
        conversations: [],
        messagesBySender: {},
        updatedAt: Date.now()
    };

    constructor(private readonly sessionManager: SessionManager) {}

    async ensureInitialized() {
        await ensureStorageRoots({
            root: this.storagePaths.root,
            authStateDir: this.storagePaths.authStateDir,
            recentsDir: this.dataDir,
            logDir: this.storagePaths.logDir
        });
        await migrateLegacyStorage({
            root: this.storagePaths.root,
            legacyRoot: this.storagePaths.legacyRoot
        });
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
            const latestMessage = this.getLatestConversationMessage(messages);
            if (!latestMessage) continue;

            summaries.set(senderNumber, {
                senderNumber,
                senderName: previousNames.get(senderNumber),
                lastMessagePreview: this.buildPreview(latestMessage.text),
                lastMessageTime: latestMessage.timestamp,
                lastMessageDirection: latestMessage.direction,
                messageCount: messages.length,
                isAllowed: this.sessionManager.isConversationAllowed(senderNumber)
            });
        }

        this.store.conversations = this.sortConversationsByLatestMessage(Array.from(summaries.values()))
            .slice(0, 20);
    }

    private getLatestConversationMessage(messages: RecentConversationMessage[]): RecentConversationMessage | undefined {
        return messages[messages.length - 1];
    }

    private sortConversationsByLatestMessage(conversations: RecentConversationSummary[]): RecentConversationSummary[] {
        return [...conversations].sort((left, right) => {
            if (right.lastMessageTime !== left.lastMessageTime) {
                return right.lastMessageTime - left.lastMessageTime;
            }

            return left.senderNumber.localeCompare(right.senderNumber);
        });
    }

    private stripSpecialCharacters(text: string): string {
        return text
            .replace(/\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|\u200D|\uFE0F/gu, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    private buildPreview(text: string): string {
        const normalized = this.stripSpecialCharacters(text);
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
        const normalizedText = this.stripSpecialCharacters(input.text);
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
            lastMessagePreview: this.buildPreview(normalizedText),
            lastMessageTime: normalizedTimestamp,
            lastMessageDirection: input.direction,
            messageCount: this.store.messagesBySender[senderNumber].length,
            isAllowed: this.sessionManager.isConversationAllowed(senderNumber)
        };

        this.store.conversations = this.sortConversationsByLatestMessage([
            summary,
            ...this.store.conversations.filter(item => item.senderNumber !== senderNumber)
        ]).slice(0, 20);

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

    /**
     * Looks up a message by its ID across all conversations.
     * Returns the message if found, or undefined if not found.
     */
    findMessageById(messageId: string): RecentConversationMessage | undefined {
        for (const messages of Object.values(this.store.messagesBySender)) {
            const found = messages.find(msg => msg.messageId === messageId);
            if (found) {
                return found;
            }
        }
        return undefined;
    }
}
