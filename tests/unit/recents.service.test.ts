import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RecentsService } from '../../src/services/recents.service.js';

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
        isAllowed: vi.fn()
    };

    beforeEach(() => {
        vi.clearAllMocks();
        sessionManager.isAllowed.mockImplementation((number: string) => number === '+5511999998888');
        fsMocks.readFile.mockRejectedValue(new Error('not found'));
        vi.spyOn(Date, 'now').mockReturnValue(1234567890);
    });

    it('initializes an empty store when no recents file exists', async () => {
        const service = new RecentsService(sessionManager as any);

        await service.ensureInitialized();

        expect(fsMocks.mkdir).toHaveBeenCalledWith(
            'C:\\Users\\test\\.pi\\whatsapp-pi\\recents',
            { recursive: true }
        );
        await expect(service.getRecentConversations()).resolves.toEqual([]);
    });

    it('records normalized messages and conversation summaries', async () => {
        const service = new RecentsService(sessionManager as any);
        await service.ensureInitialized();

        await service.recordMessage({
            messageId: 'MSG1',
            senderNumber: '5511999998888@s.whatsapp.net',
            senderName: 'Ana',
            text: '  hello\nthere  ',
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
});
