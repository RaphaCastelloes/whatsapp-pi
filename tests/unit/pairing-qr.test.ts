import { afterEach, describe, expect, it, vi } from 'vitest';
import * as qrcode from 'qrcode-terminal';
import { printPairingQr } from '../../src/ui/pairing-qr.js';

const payload = 'pairing-test,'.repeat(12);
const isTtyDescriptor = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');

function textQr(): string {
    let result = '';
    qrcode.generate(payload, { small: true }, text => { result = text; });
    return result;
}

describe('pairing QR', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
        if (isTtyDescriptor) Object.defineProperty(process.stdout, 'isTTY', isTtyDescriptor);
        else Reflect.deleteProperty(process.stdout, 'isTTY');
    });

    it('renders all QR modules with a four-module quiet zone', () => {
        vi.stubEnv('WT_SESSION', 'test');
        vi.stubEnv('TERM_PROGRAM', '');
        vi.stubEnv('TMUX', '');
        vi.stubEnv('STY', '');
        vi.stubEnv('WHATSAPP_PI_QR_TEXT', '');
        Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});

        printPairingQr(payload);

        const output = log.mock.calls[0][0] as string;
        expect(output.startsWith('\x1bP0;1q')).toBe(true);
        expect(output.endsWith('\x1b\\')).toBe(true);
        const match = /^"1;1;(\d+);(\d+)#0;2;100;100;100#1;2;0;0;0(.*)$/.exec(output.slice(6, -2));
        expect(match).not.toBeNull();
        const size = Number(match![1]);
        expect(Number(match![2])).toBe(size);
        const lines = textQr().split('\n');
        const width = lines[0].length - 2;
        expect(size).toBe((width + 8) * 4);

        const pixels = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
        const bands = match![3].split('-').filter(Boolean);
        for (let band = 0; band < bands.length; band++) {
            const black = bands[band].split('$#1')[1];
            expect(black).toHaveLength(size);
            for (let x = 0; x < size; x++) {
                const bits = black.charCodeAt(x) - 63;
                for (let bit = 0; bit < 6 && band * 6 + bit < size; bit++) {
                    pixels[band * 6 + bit][x] = (bits & (1 << bit)) !== 0;
                }
            }
        }

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const row = Math.floor(y / 4) - 4;
                const col = Math.floor(x / 4) - 4;
                const char = row >= 0 && row < width && col >= 0 && col < width
                    ? lines[1 + Math.floor(row / 2)][1 + col]
                    : '\u2588';
                const black = char === ' ' || (row % 2 === 0 ? char === '\u2584' : char === '\u2580');
                expect(pixels[y][x]).toBe(black);
            }
        }
    });

    it('keeps the text QR for unsupported terminals and when explicitly requested', () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
        vi.stubEnv('WT_SESSION', '');
        printPairingQr(payload);
        expect(log).toHaveBeenLastCalledWith(textQr());

        vi.stubEnv('WT_SESSION', 'test');
        vi.stubEnv('WHATSAPP_PI_QR_TEXT', '1');
        printPairingQr(payload);
        expect(log).toHaveBeenLastCalledWith(textQr());

        vi.stubEnv('WHATSAPP_PI_QR_TEXT', '');
        vi.stubEnv('TMUX', 'test');
        printPairingQr(payload);
        expect(log).toHaveBeenLastCalledWith(textQr());
    });
});
