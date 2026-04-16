import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MenuHandler } from '../../src/ui/menu.handler.js';

vi.mock('qrcode-terminal', () => ({
    generate: vi.fn()
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
        getIgnoredNumbers: vi.fn().mockReturnValue([]),
        removeIgnoredNumber: vi.fn().mockResolvedValue(undefined),
        getAllowedContact: vi.fn().mockReturnValue(undefined),
        isAllowed: vi.fn().mockReturnValue(false)
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
        vi.clearAllMocks();
        vi.spyOn(Date, 'now').mockReturnValue(1234567890);
    });

    it('starts WhatsApp pairing from the root menu when disconnected', async () => {
        const { whatsappService, sessionManager, recentsService } = createServices();
        sessionManager.getStatus.mockReturnValue('logged-out');
        const ctx = createContext({ selects: ['Connect WhatsApp'] });
        const handler = new MenuHandler(whatsappService as any, sessionManager as any, recentsService as any);

        await handler.handleCommand(ctx as any);

        expect(whatsappService.setQRCodeCallback).toHaveBeenCalledOnce();
        expect(whatsappService.start).toHaveBeenCalledOnce();
        expect(ctx.ui.notify).toHaveBeenCalledWith('WhatsApp Pairing Started', 'info');
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

    it('sorts allowed numbers and adds a valid number', async () => {
        const { whatsappService, sessionManager, recentsService } = createServices();
        sessionManager.getAllowList.mockReturnValue([
            { number: '+2', name: 'Zoey' },
            { number: '+1', name: 'Ana' }
        ]);
        const ctx = createContext({
            selects: ['Allowed Numbers', 'Add Number', 'Back', 'Back'],
            inputs: ['+5511999998888']
        });
        const handler = new MenuHandler(whatsappService as any, sessionManager as any, recentsService as any);

        await handler.handleCommand(ctx as any);

        expect(ctx.ui.select).toHaveBeenCalledWith('Allowed Numbers', [
            'Ana (+1)',
            'Zoey (+2)',
            'Add Number',
            'Back'
        ]);
        expect(sessionManager.addNumber).toHaveBeenCalledWith('+5511999998888');
        expect(ctx.ui.notify).toHaveBeenCalledWith('Added +5511999998888', 'info');
    });

    it('sends a message to an allowed contact with the Pi suffix and records it', async () => {
        const { whatsappService, sessionManager, recentsService } = createServices();
        sessionManager.getAllowList.mockReturnValue([{ number: '+5511999998888', name: 'Ana' }]);
        const ctx = createContext({
            selects: ['Allowed Numbers', 'Ana (+5511999998888)', 'Send Message', 'Back', 'Back', 'Back'],
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

    it('moves a blocked number to the allowed list using the displayed alias option', async () => {
        const { whatsappService, sessionManager, recentsService } = createServices();
        sessionManager.getIgnoredNumbers.mockReturnValue([{ number: '+5511999998888', name: 'Ana' }]);
        const ctx = createContext({
            selects: ['Blocked Numbers', 'Ana (+5511999998888)', 'Allow', 'Back', 'Back'],
            confirms: [true]
        });
        const handler = new MenuHandler(whatsappService as any, sessionManager as any, recentsService as any);

        await handler.handleCommand(ctx as any);

        expect(sessionManager.addNumber).toHaveBeenCalledWith('+5511999998888', 'Ana');
        expect(ctx.ui.notify).toHaveBeenCalledWith('+5511999998888 moved to Allowed List', 'info');
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
            text: 'a long message that should be truncated in the history option because it is intentionally verbose',
            direction: 'incoming',
            timestamp: 1234567890
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
            expect.arrayContaining([
                expect.stringContaining('Received'),
                expect.stringContaining('...'),
                'Back'
            ])
        );
    });
});
