import { appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export class WhatsAppPiLogger {
    private logFile: string;

    constructor(private verbose = false) {
        const logDir = join(homedir(), '.pi', 'whatsapp-pi');
        try { mkdirSync(logDir, { recursive: true }); } catch {}
        this.logFile = join(logDir, 'whatsapp-pi.log');
    }

    setVerbose(verbose: boolean) {
        this.verbose = verbose;
    }

    private writeToFile(level: string, message: string, args: unknown[]) {
        const timestamp = new Date().toISOString();
        const extra = args.length ? ' ' + args.map(a => String(a)).join(' ') : '';
        const line = `[${timestamp}] [${level}] ${message}${extra}\n`;
        try { appendFileSync(this.logFile, line); } catch {}
    }

    info(message: string, ...args: unknown[]) {
        console.log(message, ...args);
        this.writeToFile('INFO', message, args);
    }

    log(message: string, ...args: unknown[]) {
        this.writeToFile('LOG', message, args);
        if (this.verbose) {
            console.log(message, ...args);
        }
    }

    warn(message: string, ...args: unknown[]) {
        this.writeToFile('WARN', message, args);
        if (this.verbose) {
            console.warn(message, ...args);
        }
    }

    error(message: string, ...args: unknown[]) {
        this.writeToFile('ERROR', message, args);
        if (this.verbose) {
            console.error(message, ...args);
        }
    }
}
