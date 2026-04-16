import { QRError, QRErrorCode } from '../models/whatsapp.types.js';

export class QRErrorHandler {
    private errorHistory: QRError[] = [];
    private maxHistorySize = 10;

    /**
     * Handles a QR-related error
     */
    async handleError(error: QRError): Promise<void> {
        // Add to error history
        this.addToHistory(error);

        // Log the error
        this.logError(error);

        // Show user-friendly message
        this.displayError(error);
    }

    /**
     * Determines if an error is recoverable
     */
    canRecover(error: QRError): boolean {
        return error.recoverable;
    }

    /**
     * Gets recovery action for an error
     */
    getRecoveryAction(error: QRError): string | null {
        switch (error.code) {
            case QRErrorCode.TERMINAL_UNSUPPORTED:
                return 'Try using a modern terminal (Windows Terminal, iTerm2, or VS Code terminal) that supports UTF-8 characters.';
            
            case QRErrorCode.QR_GENERATION_FAILED:
                return 'Check your internet connection and try running the command again.';
            
            case QRErrorCode.DISPLAY_ERROR:
                return 'Try making your terminal window larger and run the command again.';
            
            case QRErrorCode.CONNECTION_TIMEOUT:
                return 'The QR code expired. A new one will be generated automatically.';
            
            case QRErrorCode.NETWORK_ERROR:
                return 'Check your internet connection and try again.';
            
            case QRErrorCode.INVALID_CREDENTIALS:
                return 'Run /whatsapp-logout to clear credentials and try again.';
            
            default:
                return 'Try restarting the application.';
        }
    }

    /**
     * Creates a standardized QR error
     */
    createError(code: QRErrorCode, message: string, technical?: string): QRError {
        return new QRError(
            code,
            message,
            technical,
            this.isRecoverableByDefault(code)
        );
    }

    /**
     * Gets recent error history
     */
    getErrorHistory(): QRError[] {
        return [...this.errorHistory];
    }

    /**
     * Clears error history
     */
    clearHistory(): void {
        this.errorHistory = [];
    }

    /**
     * Checks if specific error type has occurred recently
     */
    hasRecentError(code: QRErrorCode, withinMs: number = 60000): boolean {
        const now = new Date();
        return this.errorHistory.some(error => 
            error.code === code && 
            (now.getTime() - error.timestamp.getTime()) < withinMs
        );
    }

    /**
     * Private method to add error to history
     */
    private addToHistory(error: QRError): void {
        this.errorHistory.push(error);
        
        // Keep only recent errors
        if (this.errorHistory.length > this.maxHistorySize) {
            this.errorHistory = this.errorHistory.slice(-this.maxHistorySize);
        }
    }

    /**
     * Private method to log error
     */
    private logError(error: QRError): void {
        const logMessage = `[QR Error] ${error.code}: ${error.message}`;
        
        if (error.technical) {
            console.error(`${logMessage} (${error.technical})`);
        } else {
            console.error(logMessage);
        }
    }

    /**
     * Private method to display error to user
     */
    private displayError(error: QRError): void {
        console.error(`❌ ${error.message}`);
        
        const recoveryAction = this.getRecoveryAction(error);
        if (recoveryAction) {
            console.log(`💡 ${recoveryAction}`);
        }
    }

    /**
     * Private method to determine if error is recoverable by default
     */
    private isRecoverableByDefault(code: QRErrorCode): boolean {
        switch (code) {
            case QRErrorCode.TERMINAL_UNSUPPORTED:
                return false; // Requires terminal change
            
            case QRErrorCode.INVALID_CREDENTIALS:
                return true; // Can be fixed with logout
            
            case QRErrorCode.QR_GENERATION_FAILED:
            case QRErrorCode.DISPLAY_ERROR:
            case QRErrorCode.CONNECTION_TIMEOUT:
            case QRErrorCode.NETWORK_ERROR:
                return true; // Generally recoverable
            
            default:
                return true; // Assume recoverable by default
        }
    }
}
