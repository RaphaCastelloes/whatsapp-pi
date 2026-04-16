import { QRCodeDisplayOptions } from '../models/whatsapp.types.js';

export interface QRDisplayConfig {
    terminalWidth?: number;
    refreshInterval: number;
    maxRefreshAttempts: number;
    showInstructions: boolean;
    showExpirationWarning: boolean;
    expirationWarningTime: number;
    retryOnError: boolean;
    maxRetries: number;
    retryDelay: number;
}

export class QRConfigService {
    private static instance: QRConfigService;
    private config: QRDisplayConfig;

    private constructor() {
        this.config = this.getDefaultConfig();
        this.loadFromEnvironment();
    }

    /**
     * Gets singleton instance
     */
    static getInstance(): QRConfigService {
        if (!QRConfigService.instance) {
            QRConfigService.instance = new QRConfigService();
        }
        return QRConfigService.instance;
    }

    /**
     * Gets current configuration
     */
    getConfig(): QRDisplayConfig {
        return { ...this.config };
    }

    /**
     * Updates configuration
     */
    updateConfig(config: Partial<QRDisplayConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * Resets configuration to defaults
     */
    resetConfig(): void {
        this.config = this.getDefaultConfig();
    }

    /**
     * Gets QR display options for renderer
     */
    getDisplayOptions(): QRCodeDisplayOptions {
        return {
            terminalWidth: this.config.terminalWidth,
            refreshInterval: this.config.refreshInterval,
            showInstructions: this.config.showInstructions,
            showExpirationWarning: this.config.showExpirationWarning
        };
    }

    /**
     * Gets retry configuration
     */
    getRetryConfig() {
        return {
            retryOnError: this.config.retryOnError,
            maxRetries: this.config.maxRetries,
            retryDelay: this.config.retryDelay
        };
    }

    /**
     * Gets refresh configuration
     */
    getRefreshConfig() {
        return {
            refreshInterval: this.config.refreshInterval,
            maxRefreshAttempts: this.config.maxRefreshAttempts,
            expirationWarningTime: this.config.expirationWarningTime,
            showExpirationWarning: this.config.showExpirationWarning
        };
    }

    /**
     * Loads configuration from environment variables
     */
    private loadFromEnvironment(): void {
        // QR refresh interval in milliseconds
        if (process.env.QR_REFRESH_INTERVAL) {
            const interval = parseInt(process.env.QR_REFRESH_INTERVAL, 10);
            if (!isNaN(interval) && interval > 0) {
                this.config.refreshInterval = interval;
            }
        }

        // Show expiration warning
        if (process.env.QR_SHOW_WARNING !== undefined) {
            this.config.showExpirationWarning = process.env.QR_SHOW_WARNING === 'true';
        }

        // Warning time in seconds
        if (process.env.QR_WARNING_TIME) {
            const warningTime = parseInt(process.env.QR_WARNING_TIME, 10);
            if (!isNaN(warningTime) && warningTime > 0) {
                this.config.expirationWarningTime = warningTime;
            }
        }

        // Max refresh attempts
        if (process.env.QR_MAX_REFRESH_ATTEMPTS) {
            const maxAttempts = parseInt(process.env.QR_MAX_REFRESH_ATTEMPTS, 10);
            if (!isNaN(maxAttempts) && maxAttempts > 0) {
                this.config.maxRefreshAttempts = maxAttempts;
            }
        }

        // Retry on error
        if (process.env.QR_RETRY_ON_ERROR !== undefined) {
            this.config.retryOnError = process.env.QR_RETRY_ON_ERROR === 'true';
        }

        // Max retries
        if (process.env.QR_MAX_RETRIES) {
            const maxRetries = parseInt(process.env.QR_MAX_RETRIES, 10);
            if (!isNaN(maxRetries) && maxRetries >= 0) {
                this.config.maxRetries = maxRetries;
            }
        }

        // Retry delay
        if (process.env.QR_RETRY_DELAY) {
            const retryDelay = parseInt(process.env.QR_RETRY_DELAY, 10);
            if (!isNaN(retryDelay) && retryDelay > 0) {
                this.config.retryDelay = retryDelay;
            }
        }
    }

    /**
     * Gets default configuration
     */
    private getDefaultConfig(): QRDisplayConfig {
        return {
            refreshInterval: 60000, // 60 seconds
            maxRefreshAttempts: 10, // Unlimited for practical purposes
            showInstructions: true,
            showExpirationWarning: true,
            expirationWarningTime: 15, // 15 seconds before expiration
            retryOnError: true,
            maxRetries: 3,
            retryDelay: 2000 // 2 seconds
        };
    }
}
