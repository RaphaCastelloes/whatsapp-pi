import { EventEmitter } from 'events';
import { QRCodeSession, QRError, PairingStatus } from '../models/whatsapp.types.js';

export interface QREventMap {
    'qr:generated': { qrData: string; expiresAt: Date };
    'qr:expired': { sessionId: string };
    'qr:refreshed': { qrData: string; refreshCount: number };
    'pairing:started': { sessionId: string };
    'pairing:scanning': { sessionId: string };
    'pairing:completed': { sessionId: string };
    'pairing:failed': { sessionId: string; error: QRError };
    'status:changed': { status: PairingStatus };
}

export class QREventsService extends EventEmitter {
    private static instance: QREventsService;

    private constructor() {
        super();
        this.setMaxListeners(50); // Allow more listeners for QR events
    }

    /**
     * Gets singleton instance
     */
    static getInstance(): QREventsService {
        if (!QREventsService.instance) {
            QREventsService.instance = new QREventsService();
        }
        return QREventsService.instance;
    }

    /**
     * Emit QR code generated event
     */
    emitQRGenerated(qrData: string, expiresAt: Date): void {
        this.emit('qr:generated', { qrData, expiresAt });
    }

    /**
     * Emit QR code expired event
     */
    emitQRExpired(sessionId: string): void {
        this.emit('qr:expired', { sessionId });
    }

    /**
     * Emit QR code refreshed event
     */
    emitQRRefreshed(qrData: string, refreshCount: number): void {
        this.emit('qr:refreshed', { qrData, refreshCount });
    }

    /**
     * Emit pairing started event
     */
    emitPairingStarted(sessionId: string): void {
        this.emit('pairing:started', { sessionId });
    }

    /**
     * Emit pairing scanning event
     */
    emitPairingScanning(sessionId: string): void {
        this.emit('pairing:scanning', { sessionId });
    }

    /**
     * Emit pairing completed event
     */
    emitPairingCompleted(sessionId: string): void {
        this.emit('pairing:completed', { sessionId });
    }

    /**
     * Emit pairing failed event
     */
    emitPairingFailed(sessionId: string, error: QRError): void {
        this.emit('pairing:failed', { sessionId, error });
    }

    /**
     * Emit status changed event
     */
    emitStatusChanged(status: PairingStatus): void {
        this.emit('status:changed', { status });
    }

    /**
     * Type-safe event listener registration
     */
    onQRGenerated(callback: (data: QREventMap['qr:generated']) => void): void {
        this.on('qr:generated', callback);
    }

    onQRExpired(callback: (data: QREventMap['qr:expired']) => void): void {
        this.on('qr:expired', callback);
    }

    onQRRefreshed(callback: (data: QREventMap['qr:refreshed']) => void): void {
        this.on('qr:refreshed', callback);
    }

    onPairingStarted(callback: (data: QREventMap['pairing:started']) => void): void {
        this.on('pairing:started', callback);
    }

    onPairingScanning(callback: (data: QREventMap['pairing:scanning']) => void): void {
        this.on('pairing:scanning', callback);
    }

    onPairingCompleted(callback: (data: QREventMap['pairing:completed']) => void): void {
        this.on('pairing:completed', callback);
    }

    onPairingFailed(callback: (data: QREventMap['pairing:failed']) => void): void {
        this.on('pairing:failed', callback);
    }

    onStatusChanged(callback: (data: QREventMap['status:changed']) => void): void {
        this.on('status:changed', callback);
    }

    /**
     * Type-safe event listener removal
     */
    offQRGenerated(callback: (data: QREventMap['qr:generated']) => void): void {
        this.off('qr:generated', callback);
    }

    offQRExpired(callback: (data: QREventMap['qr:expired']) => void): void {
        this.off('qr:expired', callback);
    }

    offQRRefreshed(callback: (data: QREventMap['qr:refreshed']) => void): void {
        this.off('qr:refreshed', callback);
    }

    offPairingStarted(callback: (data: QREventMap['pairing:started']) => void): void {
        this.off('pairing:started', callback);
    }

    offPairingScanning(callback: (data: QREventMap['pairing:scanning']) => void): void {
        this.off('pairing:scanning', callback);
    }

    offPairingCompleted(callback: (data: QREventMap['pairing:completed']) => void): void {
        this.off('pairing:completed', callback);
    }

    offPairingFailed(callback: (data: QREventMap['pairing:failed']) => void): void {
        this.off('pairing:failed', callback);
    }

    offStatusChanged(callback: (data: QREventMap['status:changed']) => void): void {
        this.off('status:changed', callback);
    }

    /**
     * Clear all event listeners
     */
    clearAllListeners(): void {
        this.removeAllListeners();
    }

    /**
     * Get event listener count for debugging
     */
    getListenerCount(eventName: keyof QREventMap): number {
        return this.listenerCount(eventName);
    }

    /**
     * Get all event names with listeners
     */
    getActiveEvents(): (keyof QREventMap)[] {
        return Object.keys(this.eventNames()) as (keyof QREventMap)[];
    }
}
