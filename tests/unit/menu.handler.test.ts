import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MenuHandler } from '../../src/ui/menu.handler.ts';
import { resetI18n } from '../../src/i18n.ts';
import { showMessageDetailView } from '../../src/ui/message-detail.view.ts';
import { showMessageReplyView } from '../../src/ui/message-reply.view.ts';

vi.mock('qrcode-terminal', () => ({
    generate: vi.fn()
}));

vi.mock('../../src/ui/message-detail.view.ts', () => ({
    showMessageDetailView: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../../src/ui/message-reply.view.ts', () => ({
    showMessageReplyView: vi.fn().mockResolvedValue(undefined)
}));

type SelectChoice = string | ((title: string, options: string[]) => string);

const createContext = (choices: {
    selects?: SelectChoice[];
    inputs?: string[];
    confirms?: boolean[];
} = {}) => {
    const selects = [...(choices.selects ?? [])];
    const inputs = [...(choices.inputs ?? [])];
    const confirms = [...(choices.confirms ?? [])];

    return {
        ui: {
            select: vi.fn(async (title: string, options: string[]) => {
                const choice = selects.shift();
                if (typeof choice === 'function') {
                    return choice(title, options);
                }
                return choice ?? 'Back';
            }),
            input: vi.fn(async () => inputs.shift() ?? ''),
            confirm: vi.fn(async () => confirms.shift() ?? false),
            notify: vi.fn()
        }
    };
};

const createServices = () => {
    const whatsappService = {
        getEffectiveStatus: vi.fn().mockReturnValue('connected'),
        setQRCodeCallback: vi.fn(),
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue(undefined),
        logout: vi.fn().mockResolvedValue(undefined),
        sendMenuMessage: vi.fn().mockResolvedValue({ success: true, messageId: 'MSG123' })
    };

    const sessionManager = {
        getStatus: vi.fn().mockReturnValue('connected'),
        isRegistered: vi.fn().mockResolvedValue(false),
        getAllowList: vi.fn().mockReturnValue([]),
        addNumber: vi.fn().mockResolvedValue(undefined),
        removeNumber: vi.fn().mockResolvedValue(undefined),
        setAllowedContactAlias: vi.fn().mockResolvedValue(undefined),
        removeAllowedContactAlias: vi.fn().mockResolvedValue(undefined),
        getAllowedGroups: vi.fn().mockReturnValue([]),
        getAllowedGroup: vi.fn().mockReturnValue(undefined),
        addAllowedGroup: vi.fn().mockResolvedValue(undefined),
        removeAllowedGroup: vi.fn().mockResolvedValue(undefined),
        setAllowedGroupAlias: vi.fn().mockResolvedValue(undefined),
        removeAllowedGroupAlias: vi.fn().mockResolvedValue(undefined),
        getIgnoredNumbers: vi.fn().mockReturnValue([]),
        removeIgnoredNumber: vi.fn().mockResolvedValue(undefined),
        getAllowedContact: vi.fn().mockReturnValue(undefined),
        isAllowed: vi.fn().mockReturnValue(false),
        isAllowedGroup: vi.fn().mockReturnValue(false),
        isConversationAllowed: vi.fn().mockReturnValue(false)
    };

    const recentsService = {
        getRecentConversations: vi.fn().mockResolvedValue([]),
        getConversationHistory: vi.fn().mockResolvedValue([]),
        recordMessage: vi.fn().mockResolvedValue(undefined)
    };

    return { whatsappService, sessionManager, recentsService };
};

describe('MenuHandler', () => {
    beforeEach(() => {
        resetI18n();
        vi.clearAllMocks();
        vi.spyOn(Date, 'now').mockReturnValue(1234567890);
    });

    it('starts WhatsApp pairing from the root menu when disconnected', async () => {
        const { whatsappService, sessionManager, recentsService } = createServices();
        whatsappService.getEffectiveStatus.mockReturnValue('logged-out');
        const ctx = createContext({ selects: ['Connect WhatsApp'] });
        const handler = new MenuHandler(whatsappService as any, sessionManager as any, recentsService as any);

        await handler.handleCommand(ctx as any);

        expect(whatsappService.setQRCodeCallback).toHaveBeenCalledOnce();
        expect(whatsappService.start).toHaveBeenCalledOnce();
        expect(ctx.ui.notify).toHaveBeenCalledWith('WhatsApp Pairing Started', 'info');
    });

    it('uses effective WhatsApp status instead of persisted session status', async () => {
        const { whatsappService, sessionManager, recentsService } = createServices();
        sessionManager.getStatus.mockReturnValue('connected');
        whatsappService.getEffectiveStatus.mockReturnValue('disconnected');
        const ctx = createContext({ selects: ['Back'] });
        const handler = new MenuHandler(whatsappService as any, sessionManager as any, recentsService as any);

        await handler.handleCommand(ctx as any);

        expect(ctx.ui.select).toHaveBeenCalledWith('WhatsApp (Status: disconnected)', [
            'Connect WhatsApp',
            'Back'
        ]);
    });

    it('disconnects WhatsApp from the root menu when connected', async () => {
        const { whatsappService, sessionManager, recentsService } = createServices();
        const ctx = createContext({ selects: ['Disconnect WhatsApp'] });
        const handler = new MenuHandler(whatsappService as any, sessionManager as any, recentsService as any);

        await handler.handleCommand(ctx as any);

        expect(whatsappService.stop).toHaveBeenCalledOnce();
        expect(ctx.ui.notify).toHaveBeenCalledWith('WhatsApp Agent Disconnected', 'warning');
    });

    it('logs out only after confirmation', async () => {
        const { whatsappService, sessionManager, recentsService } = createServices();
        sessionManager.isRegistered.mockResolvedValue(true);
        const ctx = createContext({
            selects: ['Logoff (Delete Session)'],
            confirms: [true]
        });
        const handler = new MenuHandler(whatsappService as any, sessionManager as any, recentsService as any);

        await handler.handleCommand(ctx as any);

        expect(ctx.ui.confirm).toHaveBeenCalledWith('Logoff', 'Delete all credentials?');
        expect(whatsappService.logout).toHaveBeenCalledOnce();
        expect(ctx.ui.notify).toHaveBeenCalledWith('Logged off and credentials deleted', 'info');
    });

    it('sorts allowed contacts and adds a valid contact', async () => {
        const { whatsappService, sessionManager, recentsService } = createServices();
        sessionManager.getAllowList.mockReturnValue([
            { number: '+2', name: 'Zoey' },
            { number: '+1', name: 'Ana' }
        ]);
        const ctx = createContext({
            selects: ['Allowed Contacts', 'Add Contact', 'Back', 'Back'],
            inputs: ['+5511999998888']
        });
        const handler = new MenuHandler(whatsappService as any, sessionManager as any, recentsService as any);

        await handler.handleCommand(ctx as any);

        expect(ctx.ui.select).toHaveBeenCalledWith('Allowed Contacts', [
            'Ana (+1)',
            'Zoey (+2)',
            'Add Contact',
            'Back'
        ]);
        expect(sessionManager.addNumber).toHaveBeenCalledWith('+5511999998888');
        expect(ctx.ui.notify).toHaveBeenCalledWith('Added +5511999998888 to the allow list', 'info');
    });

    it('sends a message to an allowed contact with the Pi suffix and records it', async () => {
        const { whatsappService, sessionManager, recentsService } = createServices();
        sessionManager.getAllowList.mockReturnValue([{ number: '+5511999998888', name: 'Ana' }]);
        const ctx = createContext({
            selects: ['Allowed Contacts', 'Ana (+5511999998888)', 'Send Message', 'Back', 'Back', 'Back'],
            inputs: ['', 'Oi']
        });
        const handler = new MenuHandler(whatsappService as any, sessionManager as any, recentsService as any);

        await handler.handleCommand(ctx as any);

        expect(ctx.ui.notify).toHaveBeenCalledWith('Please enter a message before sending.', 'error');
        expect(whatsappService.sendMenuMessage).toHaveBeenCalledWith(
            '5511999998888@s.whatsapp.net',
            'Oi π'
        );
        expect(recentsService.recordMessage).toHaveBeenCalledWith({
            messageId: 'MSG123',
            senderNumber: '+5511999998888',
            senderName: 'Ana',
            text: 'Oi π',
            direction: 'outgoing',
            timestamp: 1234567890
        });
    });

    it('prints allowed contacts to the console and TUI info output on separate lines', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const { whatsappService, sessionManager, recentsService } = createServices();
        sessionManager.getAllowList.mockReturnValue([
            { number: '+5511999998888', name: 'Ana' },
            { number: '+553291297719', name: 'Dani' }
        ]);
        const ctx = createContext({
            selects: [
                'Allowed Contacts',
                'Ana (+5511999998888)',
                'Print Contact',
                'Back',
                'Dani (+553291297719)',
                'Print Contact',
                'Back',
                'Back',
                'Back'
            ]
        });
        const handler = new MenuHandler(whatsappService as any, sessionManager as any, recentsService as any);

        await handler.handleCommand(ctx as any);

        expect(ctx.ui.select).toHaveBeenCalledWith('Allowed Contact • Ana (+5511999998888)', [
            'History',
            'Send Message',
            'Print Contact',
            'Remove Alias',
            'Remove Contact',
            'Back'
        ]);
        expect(ctx.ui.notify).toHaveBeenCalledWith('+5511999998888', 'info');
        expect(ctx.ui.notify).toHaveBeenCalledWith('+5511999998888\n+553291297719', 'info');
        expect(logSpy).toHaveBeenCalledWith('[WhatsApp-Pi] Allowed contacts\n  • +5511999998888');
        expect(logSpy).toHaveBeenCalledWith('[WhatsApp-Pi] Allowed contacts\n  • +5511999998888\n  • +553291297719');
    });

    it('sorts allowed groups and adds a valid group JID', async () => {
        const { whatsappService, sessionManager, recentsService } = createServices();
        sessionManager.getAllowedGroups.mockReturnValue([
            { number: '120363222@g.us', name: 'Zeta' },
            { number: '120363111@g.us', name: 'Alpha' }
        ]);
        const ctx = createContext({
            selects: ['Allowed Groups', 'Add Group', 'Back', 'Back'],
            inputs: ['120363999@g.us']
        });
        const handler = new MenuHandler(whatsappService as any, sessionManager as any, recentsService as any);

        await handler.handleCommand(ctx as any);

        expect(ctx.ui.select).toHaveBeenCalledWith('Allowed Groups', [
            'Alpha (120363111@g.us)',
            'Zeta (120363222@g.us)',
            'Add Group',
            'Back'
        ]);
        expect(sessionManager.addAllowedGroup).toHaveBeenCalledWith('120363999@g.us');
        expect(ctx.ui.notify).toHaveBeenCalledWith('Added 120363999@g.us to the allowed groups list', 'info');
    });

    it('sends a message from recents without adding an extra Pi suffix', async () => {
        const { whatsappService, sessionManager, recentsService } = createServices();
        recentsService.getRecentConversations.mockResolvedValue([{ 
            senderNumber: '5511999998888@s.whatsapp.net',
            senderName: 'Ana',
            lastMessagePreview: 'hello',
            lastMessageTime: 1234567890,
            lastMessageDirection: 'incoming',
            messageCount: 1,
            isAllowed: false
        }]);
        const ctx = createContext({
            selects: [
                'Recents',
                (_title, options) => options[0],
                'Send Message',
                'Back',
                'Back',
                'Back'
            ],
            inputs: ['Oi']
        });
        const handler = new MenuHandler(whatsappService as any, sessionManager as any, recentsService as any);

        await handler.handleCommand(ctx as any);

        expect(whatsappService.sendMenuMessage).toHaveBeenCalledWith(
            '5511999998888@s.whatsapp.net',
            'Oi'
        );
        expect(recentsService.recordMessage).toHaveBeenCalledWith({
            messageId: 'MSG123',
            senderNumber: '5511999998888@s.whatsapp.net',
            senderName: 'Ana',
            text: 'Oi',
            direction: 'outgoing',
            timestamp: 1234567890
        });
    });

    it('opens a message detail view when a recent history item is selected', async () => {
        const { whatsappService, sessionManager, recentsService } = createServices();
        recentsService.getRecentConversations.mockResolvedValue([{ 
            senderNumber: '+5511999998888',
            senderName: 'Ana',
            lastMessagePreview: 'hello',
            lastMessageTime: 1234567890,
            lastMessageDirection: 'incoming',
            messageCount: 1,
            isAllowed: false
        }]);
        recentsService.getConversationHistory.mockResolvedValue([{ 
            messageId: 'MSG1',
            senderNumber: '+5511999998888',
            text: 'full message body',
            direction: 'incoming',
            timestamp: 1234567890
        }]);
        const ctx = createContext({
            selects: [
                'Recents',
                (_title, options) => options[0],
                'History',
                (_title, options) => options[0],
                'Back',
                'Back',
                'Back'
            ]
        });
        const handler = new MenuHandler(whatsappService as any, sessionManager as any, recentsService as any);

        await handler.handleCommand(ctx as any);

        expect(showMessageDetailView).toHaveBeenCalledWith(ctx as any, expect.objectContaining({
            title: 'Message • Ana (+5511999998888)',
            messageId: 'MSG1',
            senderNumber: '+5511999998888',
            senderName: 'Ana',
            text: 'full message body',
            direction: 'incoming',
            timestamp: 1234567890
        }));
    });

    it('opens the reply composer from the selected message context', async () => {
        const { whatsappService, sessionManager, recentsService } = createServices();
        recentsService.getRecentConversations.mockResolvedValue([{ 
            senderNumber: '+5511999998888',
            senderName: 'Ana',
            lastMessagePreview: 'hello',
            lastMessageTime: 1234567890,
            lastMessageDirection: 'incoming',
            messageCount: 1,
            isAllowed: false
        }]);
        recentsService.getConversationHistory.mockResolvedValue([{ 
            messageId: 'MSG1',
            senderNumber: '+5511999998888',
            text: 'full message body',
            direction: 'incoming',
            timestamp: 1234567890
        }]);
        const ctx = createContext({
            selects: [
                'Recents',
                (_title, options) => options[0],
                'History',
                (_title, options) => options[0],
                'Back',
                'Back',
                'Back'
            ]
        });
        const handler = new MenuHandler(whatsappService as any, sessionManager as any, recentsService as any);

        vi.mocked(showMessageDetailView).mockResolvedValueOnce('reply');

        await handler.handleCommand(ctx as any);

        expect(showMessageReplyView).toHaveBeenCalledWith(ctx as any, expect.objectContaining({
            selectedMessage: expect.objectContaining({
                messageId: 'MSG1',
                senderNumber: '+5511999998888',
                senderName: 'Ana',
                text: 'full message body',
                direction: 'incoming',
                timestamp: 1234567890
            })
        }));
    });

    it('shows History first in the recents action menu', async () => {
        const { whatsappService, sessionManager, recentsService } = createServices();
        recentsService.getRecentConversations.mockResolvedValue([{
            senderNumber: '+5511999998888',
            senderName: 'Ana',
            lastMessagePreview: 'hello',
            lastMessageTime: 1234567890,
            lastMessageDirection: 'incoming',
            messageCount: 1,
            isAllowed: false
        }]);
        const ctx = createContext({
            selects: [
                'Recents',
                (_title, options) => options[0],
                'Back',
                'Back',
                'Back'
            ]
        });
        const handler = new MenuHandler(whatsappService as any, sessionManager as any, recentsService as any);

        await handler.handleCommand(ctx as any);

        expect(ctx.ui.select).toHaveBeenCalledWith('Recents • Ana (+5511999998888)', [
            'History',
            'Allow Contact',
            'Send Message',
            'Back'
        ]);
    });


    it('shows recent conversation history options', async () => {
        const { whatsappService, sessionManager, recentsService } = createServices();
        recentsService.getRecentConversations.mockResolvedValue([{
            senderNumber: '+5511999998888',
            senderName: 'Ana',
            lastMessagePreview: 'hello',
            lastMessageTime: 1234567890,
            lastMessageDirection: 'incoming',
            messageCount: 1,
            isAllowed: false
        }]);
        recentsService.getConversationHistory.mockResolvedValue([{
            messageId: 'MSG1',
            senderNumber: '+5511999998888',
            text: 'newer day but earlier time',
            direction: 'incoming',
            timestamp: new Date(2026, 3, 17, 8, 30, 0).getTime()
        }, {
            messageId: 'MSG2',
            senderNumber: '+5511999998888',
            text: 'older day but later time that should be truncated in the history option because it is intentionally verbose',
            direction: 'outgoing',
            timestamp: new Date(2026, 3, 16, 23, 29, 59).getTime()
        }, {
            messageId: 'MSG3',
            senderNumber: '+5511999998888',
            text: 'newest day same time',
            direction: 'incoming',
            timestamp: new Date(2026, 3, 18, 8, 30, 0).getTime()
        }, {
            messageId: 'MSG4',
            senderNumber: '+5511999998888',
            text: 'newest day later time',
            direction: 'outgoing',
            timestamp: new Date(2026, 3, 18, 21, 45, 0).getTime()
        }]);
        const ctx = createContext({
            selects: [
                'Recents',
                (_title, options) => options[0],
                'History',
                'Back',
                'Back',
                'Back',
                'Back'
            ]
        });
        const handler = new MenuHandler(whatsappService as any, sessionManager as any, recentsService as any);

        await handler.handleCommand(ctx as any);

        expect(recentsService.getConversationHistory).toHaveBeenCalledWith('+5511999998888');
        expect(ctx.ui.select).toHaveBeenCalledWith(
            expect.stringContaining('History • Ana (+5511999998888)'),
            [
                expect.stringContaining('Sent'),
                expect.stringContaining('Received'),
                expect.stringContaining('Received'),
                expect.stringContaining('Sent'),
                'Back'
            ]
        );
        const historyOptions = ctx.ui.select.mock.calls.find(([title]) =>
            String(title).startsWith('History •')
        )?.[1];
        expect(historyOptions).toBeDefined();
        expect(historyOptions![0]).toContain('newest day later time');
        expect(historyOptions![1]).toContain('newest day same time');
        expect(historyOptions![2]).toContain('newer day but earlier time');
        expect(historyOptions![3]).toContain('older day but later time');
        expect(historyOptions![3]).toContain('...');
    });
});
