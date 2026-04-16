import qr from 'qrcode-terminal';
import { QRCodeDisplayOptions, QRError, QRErrorCode } from '../models/whatsapp.types.js';

export class QRRendererService {
    private terminalWidth: number;
    private supportsUTF8: boolean;

    constructor() {
        this.terminalWidth = this.detectTerminalWidth();
        this.supportsUTF8 = this.detectUTF8Support();
    }

    /**
     * Renders a QR code in the terminal
     */
    async renderQR(qrData: string, options?: QRCodeDisplayOptions): Promise<void> {
        try {
            if (!this.supportsUTF8) {
                throw new QRError(
                    QRErrorCode.TERMINAL_UNSUPPORTED,
                    'Terminal does not support UTF-8 characters required for QR code display',
                    'UTF-8 support detection failed',
                    false
                );
            }

            const displayOptions = {
                small: true,
                ...options
            };

            // Clear any existing QR display
            await this.clearQR();

            // Render the QR code
            qr.generate(qrData, displayOptions);

        } catch (error) {
            if (error instanceof QRError) {
                throw error;
            }
            throw new QRError(
                QRErrorCode.DISPLAY_ERROR,
                'Failed to render QR code in terminal',
                error instanceof Error ? error.message : 'Unknown error',
                true
            );
        }
    }

    /**
     * Clears the terminal display
     */
    async clearQR(): Promise<void> {
        try {
            // Clear screen and move cursor to top
            process.stdout.write('\x1b[2J\x1b[H');
        } catch (error) {
            // Non-critical error, continue
        }
    }

    /**
     * Shows pairing instructions to the user
     */
    showInstructions(): void {
        const instructions = [
            '',
            'WhatsApp: Pairing...',
            'Scan this QR code with your WhatsApp mobile app:',
            '',
            '1. Open WhatsApp on your phone',
            '2. Go to Settings > Linked Devices',
            '3. Tap "Link a device"',
            '4. Point your camera at this QR code',
            ''
        ];

        instructions.forEach(line => {
            console.log(line);
        });
    }

    /**
     * Shows a warning message
     */
    showWarning(message: string): void {
        console.log(`⚠️  ${message}`);
    }

    /**
     * Shows an error message
     */
    showError(error: QRError): void {
        console.error(`❌ ${error.message}`);
        if (error.technical && process.env.NODE_ENV === 'development') {
            console.error(`Technical details: ${error.technical}`);
        }
        if (error.recoverable) {
            console.log('💡 You can try again.');
        }
    }

    /**
     * Detects terminal width
     */
    getTerminalWidth(): number {
        return this.terminalWidth;
    }

    /**
     * Checks if terminal supports UTF-8
     */
    supportsUTF8Display(): boolean {
        return this.supportsUTF8;
    }

    /**
     * Internal method to detect terminal width
     */
    private detectTerminalWidth(): number {
        try {
            if (process.stdout.columns) {
                return process.stdout.columns;
            }
            // Fallback to common terminal width
            return 80;
        } catch {
            return 80;
        }
    }

    /**
     * Internal method to detect UTF-8 support
     */
    private detectUTF8Support(): boolean {
        try {
            // Check for common UTF-8 environment variables
            const lang = process.env.LANG || '';
            const lcAll = process.env.LC_ALL || '';
            const termProgram = process.env.TERM_PROGRAM || '';
            
            return lang.includes('UTF-8') || 
                   lang.includes('utf8') || 
                   lcAll.includes('UTF-8') || 
                   lcAll.includes('utf8') ||
                   process.platform === 'darwin' || // macOS usually supports UTF-8
                   termProgram.includes('vscode') || // VS Code terminal
                   termProgram.includes('hyper'); // Hyper terminal
        } catch {
            return false;
        }
    }
}
