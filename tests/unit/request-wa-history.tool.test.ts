import { describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ request: vi.fn(), status: vi.fn() }));
vi.mock('../../src/services/whatsapp.service.js', () => ({ WhatsAppService: class {
    setRecentsService() {} setMessageCallback() {} canonicalConversation(jid: string) { return jid; }
    getSessionContext() { return { accountScope: 'test', generation: 0 }; }
    requestHistory = mocks.request; getHistoryStatus = mocks.status;
} }));
import extension from '../../whatsapp-pi.ts';

interface Tool { name: string; execute(id: string, args: Record<string, unknown>): Promise<{ isError: boolean; content: Array<{ text: string }> }> }
function tool() {
    const tools: Tool[] = [];
    extension({ on: vi.fn(), registerFlag: vi.fn(), registerCommand: vi.fn(), registerTool: (definition: Tool) => tools.push(definition) } as never);
    return tools.find(entry => entry.name === 'request_wa_history')!;
}
describe('request_wa_history explicit network/local modes', () => {
    it('requires an explicit target and submits bounded request parameters only in request mode', async () => {
        mocks.request.mockResolvedValue({ success: true, request: { id: 'request', status: 'pending' } });
        const entry = tool(); const missing = await entry.execute('1', { mode: 'request' }); expect(missing.isError).toBe(true);
        const result = await entry.execute('2', { mode: 'request', jid: '15550000001@s.whatsapp.net', count: 3 });
        expect(result.isError).toBe(false); expect(mocks.request).toHaveBeenCalledWith('15550000001@s.whatsapp.net', 3);
    });
    it('status mode does not call the network-request method', async () => {
        mocks.request.mockClear(); mocks.status.mockResolvedValue({ success: true, request: { id: 'request', status: 'unknown' } });
        const result = await tool().execute('status', { mode: 'status', requestId: 'request' });
        expect(result.isError).toBe(false); expect(mocks.status).toHaveBeenCalledWith('request'); expect(mocks.request).not.toHaveBeenCalled();
    });
});
