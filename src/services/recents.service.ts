import { readFile, writeFile } from 'fs/promises';
import { createStoragePaths, ensureStorageDirectories as ensureStorageRoots, migrateLegacyStorage } from './storage-path.js';
import type {
    MessageDirection,
    RecentConversationMessage,
    RecentConversationSummary,
    RecentsStore
} from '../models/whatsapp.types.js';
import { SessionManager } from './session.manager.js';
import { MessageStore } from './message-store.service.js';
import { JidResolver } from './jid-resolver.service.js';
import type { ArchivedMessage } from '../models/message-archive.types.js';
import { t } from '../i18n.js';

export interface RecentsMessageInput {
    quotedMessageId?: string;
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

    private archive?: MessageStore;
    private selectedScope?: string;
    private summaryScope?: string;
    private readonly ignoredSummaries = new Map<string, RecentConversationSummary>();

    constructor(private readonly sessionManager: SessionManager) {}

    useMessageStore(store: MessageStore): void { this.archive = store; }
    getMessageStore(): MessageStore | undefined { return this.archive; }
    async bindAccount(account: string, scope: string): Promise<void> {
        if (this.summaryScope !== scope) { this.ignoredSummaries.clear(); this.summaryScope = scope; }
        await this.archive?.activate(account, scope);
    }
    recordIgnoredSummary(input: { senderNumber: string; senderName?: string; text: string; timestamp: number }): void {
        const number = this.normalizeNumber(input.senderNumber);
        this.ignoredSummaries.delete(number);
        this.ignoredSummaries.set(number, { senderNumber: number, senderName: input.senderName,
            lastMessagePreview: this.buildPreview(input.text), lastMessageTime: input.timestamp, lastMessageDirection: 'incoming', messageCount: 0, isAllowed: false });
        while (this.ignoredSummaries.size > 20) this.ignoredSummaries.delete(this.ignoredSummaries.keys().next().value!);
    }
    getArchiveState() { const state = this.archive?.getArchiveState(); return state ? { ...state, path: undefined } : undefined; }
    async getHistoryScopes() { return this.archive?.listHistoryScopes() ?? []; }
    async selectHistoryScope(scope?: string): Promise<void> {
        if (scope && !(await this.getHistoryScopes()).some(entry => entry.id === scope)) throw new Error(t('archive.unknownScope'));
        this.selectedScope = scope;
    }

    async ensureInitialized() {
        const options = this.sessionManager.getArchiveStorageOptions?.();
        if (options) {
            this.archive ??= new MessageStore(new JidResolver(), () => 'offline');
            await this.archive.initialize(options);
            return;
        }
        // Compatibility for older embedders without the archive profile contract.
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
        if (this.archive) {
            const jid = input.senderNumber.includes('@') ? input.senderNumber : `${input.senderNumber.replace(/^\+/, '')}@s.whatsapp.net`;
            this.archive.annotate({ remoteJid: jid, id: input.messageId, fromMe: input.direction === 'outgoing' }, input);
            await this.archive.flush();
            return;
        }
        const senderNumber = this.normalizeNumber(input.senderNumber);
        if (!senderNumber) return;

        const normalizedTimestamp = this.normalizeTimestamp(input.timestamp);
        const normalizedText = this.stripSpecialCharacters(input.text);
        if (!normalizedText) return;

        const existing = this.store.messagesBySender[senderNumber] ?? [];
        const nextMessage: RecentConversationMessage = {
            messageId: input.messageId,
            ...(input.quotedMessageId ? { quotedMessageId: input.quotedMessageId } : {}),
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

    async getRecentConversations(scope?: string): Promise<RecentConversationSummary[]> {
        if (this.archive) {
            const records = await this.archive.historyRecords(scope ?? this.selectedScope);
            const summaries = new Map<string, RecentConversationSummary>();
            for (const record of [...records].sort((a, b) => a.timestamp - b.timestamp || (a.key.id ?? '').localeCompare(b.key.id ?? ''))) {
                const number = this.sender(record);
                const previous = summaries.get(number);
                summaries.set(number, { senderNumber: number, senderName: record.senderName ?? previous?.senderName,
                    lastMessagePreview: this.buildPreview(this.recordText(record)), lastMessageTime: record.timestamp,
                    lastMessageDirection: record.direction, messageCount: (previous?.messageCount ?? 0) + 1,
                    isAllowed: this.sessionManager.isConversationAllowed(number) });
            }
            const selected = scope ?? this.selectedScope;
            if (!selected || selected === this.archive.getArchiveState().scopeId) {
                for (const [number, summary] of this.ignoredSummaries) {
                    if (summary.lastMessageTime < Date.now() - 86_400_000) { this.ignoredSummaries.delete(number); continue; }
                    if (!summaries.has(number)) summaries.set(number, summary);
                }
            }
            return this.sortConversationsByLatestMessage([...summaries.values()]).slice(0, 20);
        }
        this.rebuildConversationState();
        return [...this.store.conversations];
    }

    async getHistoryPage(senderNumber: string, options: { limit?: number; cursor?: string; scope?: string } = {}) {
        const scope = options.scope ?? this.selectedScope;
        const scopeId = scope ?? this.archive?.getArchiveState().scopeId ?? 'legacy-unassigned';
        const sender = this.normalizeNumber(senderNumber);
        const limit = options.limit ?? 20;
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error(t('archive.invalidCursor'));
        const records = (await this.archive?.historyRecords(scope) ?? []).filter(record => this.sender(record) === sender)
            .sort((a, b) => this.orderKey(a).localeCompare(this.orderKey(b)));
        let before: string | undefined;
        if (options.cursor) {
            try {
                const cursor = JSON.parse(Buffer.from(options.cursor, 'base64url').toString('utf8')) as { scope?: string; sender: string; before: string };
                if (cursor.scope !== scopeId || cursor.sender !== sender || typeof cursor.before !== 'string') throw new Error();
                before = cursor.before;
            } catch { throw new Error(t('archive.invalidCursor')); }
        }
        const eligible = before ? records.filter(record => this.orderKey(record) < before!) : records;
        const page = eligible.slice(-limit);
        const nextCursor = eligible.length > page.length && page[0]
            ? Buffer.from(JSON.stringify({ scope: scopeId, sender, before: this.orderKey(page[0]) })).toString('base64url') : undefined;
        return { messages: page.map(record => ({ ...this.toRecent(record), historyScope: scopeId,
            quoteAvailable: Boolean(record.quote && !record.legacySender && !record.deleted && record.key.fromMe != null
                && (!record.key.remoteJid?.endsWith('@g.us') || record.key.participant)
                && !(record.key.fromMe && record.key.participant?.endsWith('@lid'))
                && !this.archive?.getArchiveState().degraded && scopeId === this.archive?.getArchiveState().scopeId) })), nextCursor, storage: this.getArchiveState() };
    }

    private orderKey(record: ArchivedMessage): string {
        return JSON.stringify([String(record.timestamp).padStart(16, '0'), record.key.id, record.key.fromMe, record.key.participant ?? '']);
    }
    private sender(record: ArchivedMessage): string { return this.normalizeNumber(record.legacySender ?? record.canonicalChat ?? record.key.remoteJid ?? ''); }
    private recordText(record: ArchivedMessage): string { return record.deleted ? t(`archive.deleted.${record.deleted}`) : record.text; }
    private toRecent(record: ArchivedMessage): RecentConversationMessage {
        return { messageId: record.key.id!, senderNumber: this.sender(record), text: this.recordText(record), direction: record.direction,
            timestamp: record.timestamp, key: record.key, media: record.media, quotedMessageId: record.quotedMessageId, status: record.status, sendState: record.sendState,
            editedAt: record.editedAt, deleted: record.deleted, receipts: record.receipts, reactions: record.reactions, incomplete: record.incomplete };
    }

    async getConversationHistory(senderNumber: string): Promise<RecentConversationMessage[]> {
        if (this.archive) return (await this.getHistoryPage(senderNumber)).messages;
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
        if (this.archive) {
            const matches = this.archive.listRecords().filter(record => record.key.id === messageId);
            return matches.length === 1 ? this.toRecent(matches[0]) : undefined;
        }
        for (const messages of Object.values(this.store.messagesBySender)) {
            const found = messages.find(msg => msg.messageId === messageId);
            if (found) {
                return found;
            }
        }
        return undefined;
    }
}
