import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RecentsService } from '../../src/services/recents.service.ts';

const fsMocks = vi.hoisted(() => ({
    mkdir: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn(),
    writeFile: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('os', () => ({
    homedir: () => 'C:\\Users\\test'
}));

vi.mock('fs/promises', () => ({
    mkdir: fsMocks.mkdir,
    readFile: fsMocks.readFile,
    writeFile: fsMocks.writeFile
}));

describe('RecentsService', () => {
    const sessionManager = {
        isConversationAllowed: vi.fn()
    };

    beforeEach(() => {
        vi.clearAllMocks();
        sessionManager.isConversationAllowed.mockImplementation((number: string) => number === '+5511999998888');
        fsMocks.readFile.mockRejectedValue(new Error('not found'));
        vi.spyOn(Date, 'now').mockReturnValue(1234567890);
    });

    it('initializes an empty store when no recents file exists', async () => {
        const service = new RecentsService(sessionManager as any);

        await service.ensureInitialized();

        expect(fsMocks.mkdir).toHaveBeenCalled();
        expect(fsMocks.mkdir.mock.calls.some((call: any) => 
            call[0].includes('whatsapp-pi') && call[1]?.recursive === true
        )).toBe(true);
        await expect(service.getRecentConversations()).resolves.toEqual([]);
    });

    it('records normalized messages and conversation summaries', async () => {
        const service = new RecentsService(sessionManager as any);
        await service.ensureInitialized();

        await service.recordMessage({
            messageId: 'MSG1',
            senderNumber: '5511999998888@s.whatsapp.net',
            senderName: 'Ana',
            text: '  hello 👋\nthere 😊  ',
            direction: 'incoming',
            timestamp: 1000
        });

        expect(fsMocks.writeFile).toHaveBeenCalledOnce();
        const persisted = JSON.parse(fsMocks.writeFile.mock.calls[0][1]);
        expect(persisted.messagesBySender['+5511999998888'][0]).toEqual({
            messageId: 'MSG1',
            senderNumber: '+5511999998888',
            text: 'hello there',
            direction: 'incoming',
            timestamp: 1000000
        });
        expect(await service.getRecentConversations()).toEqual([
            expect.objectContaining({
                senderNumber: '+5511999998888',
                senderName: 'Ana',
                lastMessagePreview: 'hello there',
                isAllowed: true
            })
        ]);
    });

    it('deduplicates messages by id and keeps history sorted', async () => {
        const service = new RecentsService(sessionManager as any);
        await service.ensureInitialized();

        await service.recordMessage({
            messageId: 'MSG1',
            senderNumber: '+5511999998888',
            text: 'first',
            direction: 'incoming',
            timestamp: 3000
        });
        await service.recordMessage({
            messageId: 'MSG1',
            senderNumber: '+5511999998888',
            text: 'edited',
            direction: 'incoming',
            timestamp: 1000
        });
        await service.recordMessage({
            messageId: 'MSG2',
            senderNumber: '+5511999998888',
            text: 'second',
            direction: 'outgoing',
            timestamp: 2000
        });

        await expect(service.getConversationHistory('+5511999998888')).resolves.toEqual([
            expect.objectContaining({ messageId: 'MSG1', text: 'edited', timestamp: 1000000 }),
            expect.objectContaining({ messageId: 'MSG2', text: 'second', timestamp: 2000000 })
        ]);
    });

    it('ignores messages that become empty after stripping special characters', async () => {
        const service = new RecentsService(sessionManager as any);
        await service.ensureInitialized();

        await service.recordMessage({
            messageId: 'MSG1',
            senderNumber: '+5511999998888',
            text: '😀👍',
            direction: 'incoming',
            timestamp: 1000
        });

        expect(fsMocks.writeFile).not.toHaveBeenCalled();
        await expect(service.getRecentConversations()).resolves.toEqual([]);
    });

    it('strips emoji components without dropping adjacent text', async () => {
        const service = new RecentsService(sessionManager as any);
        await service.ensureInitialized();

        await service.recordMessage({
            messageId: 'MSG1',
            senderNumber: '+5511999998888',
            text: '\u2708\uFE0F Boarding \u{1F1E7}\u{1F1F7} now',
            direction: 'incoming',
            timestamp: 1000
        });

        const persisted = JSON.parse(fsMocks.writeFile.mock.calls[0][1]);
        expect(persisted.messagesBySender['+5511999998888'][0].text).toBe('Boarding now');
        await expect(service.getRecentConversations()).resolves.toEqual([
            expect.objectContaining({ lastMessagePreview: 'Boarding now' })
        ]);
    });

    it('orders conversations by their latest message time', async () => {
        const service = new RecentsService(sessionManager as any);
        await service.ensureInitialized();

        await service.recordMessage({
            messageId: 'MSG1',
            senderNumber: '+5511000000001',
            senderName: 'First',
            text: 'older',
            direction: 'incoming',
            timestamp: 1000
        });
        await service.recordMessage({
            messageId: 'MSG2',
            senderNumber: '+5511000000002',
            senderName: 'Second',
            text: 'newer',
            direction: 'incoming',
            timestamp: 2000
        });

        await expect(service.getRecentConversations()).resolves.toEqual([
            expect.objectContaining({ senderNumber: '+5511000000002', lastMessagePreview: 'newer' }),
            expect.objectContaining({ senderNumber: '+5511000000001', lastMessagePreview: 'older' })
        ]);
    });

    it('loads and normalizes existing recents from disk', async () => {
        fsMocks.readFile.mockResolvedValue(JSON.stringify({
            conversations: [{ senderNumber: '+5511999998888', senderName: 'Ana' }],
            messagesBySender: {
                '+5511999998888': [
                    { messageId: 'bad', senderNumber: '+5511999998888', text: '   ', direction: 'incoming', timestamp: 1 },
                    { messageId: 'MSG1', senderNumber: '+5511999998888', text: 'loaded', direction: 'incoming', timestamp: 1000 }
                ]
            },
            updatedAt: 1
        }));
        const service = new RecentsService(sessionManager as any);

        await service.ensureInitialized();

        await expect(service.getRecentConversations()).resolves.toEqual([
            expect.objectContaining({
                senderNumber: '+5511999998888',
                senderName: 'Ana',
                lastMessagePreview: 'loaded',
                messageCount: 1
            })
        ]);
    });

    describe('findMessageById', () => {
        it('finds a message by its ID across all conversations', async () => {
            const service = new RecentsService(sessionManager as any);
            await service.ensureInitialized();

            await service.recordMessage({
                messageId: 'MSG1',
                senderNumber: '+5511999998888',
                text: 'First message',
                direction: 'incoming',
                timestamp: 1000
            });

            await service.recordMessage({
                messageId: 'MSG2',
                senderNumber: '+5511999998888',
                text: 'Second message',
                direction: 'outgoing',
                timestamp: 2000
            });

            await service.recordMessage({
                messageId: 'MSG3',
                senderNumber: '+5511000000001',
                text: 'Different conversation',
                direction: 'incoming',
                timestamp: 3000
            });

            const found = service.findMessageById('MSG2');
            expect(found).toEqual({
                messageId: 'MSG2',
                senderNumber: '+5511999998888',
                text: 'Second message',
                direction: 'outgoing',
                timestamp: 2000000
            });
        });

        it('returns undefined when message ID is not found', async () => {
            const service = new RecentsService(sessionManager as any);
            await service.ensureInitialized();

            await service.recordMessage({
                messageId: 'MSG1',
                senderNumber: '+5511999998888',
                text: 'Only message',
                direction: 'incoming',
                timestamp: 1000
            });

            const found = service.findMessageById('NONEXISTENT');
            expect(found).toBeUndefined();
        });

        it('returns undefined when no messages exist', async () => {
            const service = new RecentsService(sessionManager as any);
            await service.ensureInitialized();

            const found = service.findMessageById('MSG1');
            expect(found).toBeUndefined();
        });

        it('finds messages across multiple conversations', async () => {
            const service = new RecentsService(sessionManager as any);
            await service.ensureInitialized();

            await service.recordMessage({
                messageId: 'MSG1',
                senderNumber: '+5511999998888',
                text: 'Conversation A',
                direction: 'incoming',
                timestamp: 1000
            });

            await service.recordMessage({
                messageId: 'MSG2',
                senderNumber: '+5511000000001',
                text: 'Conversation B',
                direction: 'incoming',
                timestamp: 2000
            });

            await service.recordMessage({
                messageId: 'MSG3',
                senderNumber: '+5511000000002',
                text: 'Conversation C',
                direction: 'incoming',
                timestamp: 3000
            });

            const foundA = service.findMessageById('MSG1');
            const foundB = service.findMessageById('MSG2');
            const foundC = service.findMessageById('MSG3');

            expect(foundA?.text).toBe('Conversation A');
            expect(foundB?.text).toBe('Conversation B');
            expect(foundC?.text).toBe('Conversation C');
        });
    });
});
