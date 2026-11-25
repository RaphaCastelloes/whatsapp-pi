import * as qrcode from 'qrcode-terminal';

// Windows Terminal maps sixel pixels to a 10-by-20 virtual text cell.
const MODULE_SIZE = 4;
// QR codes require a four-module quiet zone on every side.
const QUIET_ZONE = 4;

function toSixel(text: string): string | undefined {
    const lines = text.replace(/\n$/, '').split('\n');
    const width = lines[0]?.length - 2;
    if (!width || width % 2 !== 1 || lines.length !== 1 + Math.ceil(width / 2)) return undefined;

    const modules: boolean[][] = [];
    for (const line of lines.slice(1)) {
        if (line.length !== width + 2 || line[0] !== '\u2588' || line.at(-1) !== '\u2588') return undefined;
        const top: boolean[] = [];
        const bottom: boolean[] = [];
        for (const char of line.slice(1, -1)) {
            if (![' ', '\u2588', '\u2580', '\u2584'].includes(char)) return undefined;
            top.push(char === ' ' || char === '\u2584');
            bottom.push(char === ' ' || char === '\u2580');
        }
        modules.push(top, bottom);
    }
    modules.pop(); // QR matrices have an odd number of rows; the last row is padding.

    const size = (width + 2 * QUIET_ZONE) * MODULE_SIZE;
    let output = `\x1bP0;1q"1;1;${size};${size}#0;2;100;100;100#1;2;0;0;0`;
    for (let y = 0; y < size; y += 6) {
        const white = String.fromCharCode(63 + (1 << Math.min(6, size - y)) - 1);
        output += `#0!${size}${white}$#1`;
        for (let x = 0; x < size; x++) {
            let bits = 0;
            for (let bit = 0; bit < 6 && y + bit < size; bit++) {
                const row = Math.floor((y + bit) / MODULE_SIZE) - QUIET_ZONE;
                const col = Math.floor(x / MODULE_SIZE) - QUIET_ZONE;
                if (modules[row]?.[col]) bits |= 1 << bit;
            }
            output += String.fromCharCode(63 + bits);
        }
        output += '-';
    }
    return `${output}\x1b\\`;
}

export function printPairingQr(qr: string): void {
    qrcode.generate(qr, { small: true }, text => {
        // Windows Terminal 1.22+ supports sixel; multiplexers and other terminals may not.
        const useSixel = process.stdout.isTTY && process.env.WT_SESSION &&
            !process.env.TMUX && !process.env.STY && !process.env.TERM_PROGRAM &&
            process.env.WHATSAPP_PI_QR_TEXT !== '1';
        console.log(useSixel ? toSixel(text) ?? text : text);
    });
}
