# QR Code Display Interface Contracts

**Feature**: 014-qr-code-display  
**Date**: 2025-04-15  
**Purpose**: Define interface contracts for QR code functionality

## Public Interface Contracts

### WhatsAppService QR Extension

```typescript
interface IQRCodeDisplay {
  // QR Code Display Management
  startQRDisplay(): Promise<void>;
  stopQRDisplay(): Promise<void>;
  refreshQRCode(): Promise<void>;
  
  // Status and State
  isQRDisplaying(): boolean;
  getQRDisplayState(): QRDisplayState | undefined;
  getPairingStatus(): PairingStatus;
  
  // Event Callbacks
  onQRGenerated(callback: (qrData: string) => void): void;
  onQRExpired(callback: () => void): void;
  onPairingComplete(callback: () => void): void;
  onPairingFailed(callback: (error: QRError) => void): void;
}
```

### Session Manager QR Extension

```typescript
interface IQRSessionManager {
  // QR Session Detection
  needsQRCode(): Promise<boolean>;
  hasValidCredentials(): Promise<boolean>;
  
  // QR Completion Handling
  markQRCompleted(): Promise<void>;
  invalidateQRSession(): Promise<void>;
  
  // Credential State
  waitForCredentials(timeout?: number): Promise<boolean>;
}
```

### Terminal QR Renderer Interface

```typescript
interface IQRRenderer {
  // Core Rendering
  renderQR(qrData: string, options?: QRDisplayOptions): Promise<void>;
  clearQR(): Promise<void>;
  
  // Terminal Capabilities
  supportsUTF8(): boolean;
  getTerminalWidth(): number;
  
  // Display Management
  showInstructions(): void;
  showWarning(message: string): void;
  showError(error: QRError): void;
}
```

## CLI Integration Contract

### Command Line Interface

```typescript
interface IWhatsAppCLI {
  // Flag Handling
  parseFlags(args: string[]): ParsedFlags;
  
  // Connection Flow
  startConnection(flags: ParsedFlags): Promise<void>;
  handleQRFlow(flags: ParsedFlags): Promise<void>;
  
  // Status Display
  showStatus(status: ExtendedSessionStatus): void;
  showPairingProgress(status: PairingStatus): void;
}
```

### Flag Definitions

```typescript
interface ParsedFlags {
  whatsappOnline: boolean;       // --whatsapp-pi-online flag
  verbose: boolean;              // --verbose flag
  config?: string;               // --config flag
  [key: string]: any;            // Additional flags
}
```

## Event System Contracts

### QR Code Events

```typescript
interface QREventMap {
  'qr:generated': { qrData: string; expiresAt: Date };
  'qr:expired': { sessionId: string };
  'qr:refreshed': { qrData: string; refreshCount: number };
  'pairing:started': { sessionId: string };
  'pairing:scanning': { sessionId: string };
  'pairing:completed': { sessionId: string };
  'pairing:failed': { sessionId: string; error: QRError };
}
```

### Event Emitter Interface

```typescript
interface IQREventEmitter {
  on<K extends keyof QREventMap>(event: K, callback: (data: QREventMap[K]) => void): void;
  off<K extends keyof QREventMap>(event: K, callback: (data: QREventMap[K]) => void): void;
  emit<K extends keyof QREventMap>(event: K, data: QREventMap[K]): void;
}
```

## Error Handling Contracts

### Error Types

```typescript
enum QRErrorCode {
  TERMINAL_UNSUPPORTED = 'TERMINAL_UNSUPPORTED',
  QR_GENERATION_FAILED = 'QR_GENERATION_FAILED',
  DISPLAY_ERROR = 'DISPLAY_ERROR',
  CONNECTION_TIMEOUT = 'CONNECTION_TIMEOUT',
  NETWORK_ERROR = 'NETWORK_ERROR',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS'
}

interface QRError {
  code: QRErrorCode;
  message: string;
  technical?: string;
  recoverable: boolean;
  timestamp: Date;
}
```

### Error Handler Interface

```typescript
interface IQRErrorHandler {
  handleError(error: QRError): Promise<void>;
  canRecover(error: QRError): boolean;
  getRecoveryAction(error: QRError): string | null;
}
```

## Configuration Contracts

### QR Display Configuration

```typescript
interface QRDisplayConfig {
  // Display Options
  terminalWidth?: number;
  refreshInterval: number;       // milliseconds
  maxRefreshAttempts: number;
  
  // UI Options
  showInstructions: boolean;
  showExpirationWarning: boolean;
  expirationWarningTime: number; // seconds before expiration
  
  // Error Handling
  retryOnError: boolean;
  maxRetries: number;
  retryDelay: number;            // milliseconds
}
```

### Configuration Provider

```typescript
interface IQRConfigProvider {
  getConfig(): QRDisplayConfig;
  updateConfig(config: Partial<QRDisplayConfig>): void;
  resetConfig(): void;
}
```

## Integration Contracts

### Baileys Integration

```typescript
interface IBaileysQRIntegration {
  // QR Data Handling
  onQRReceived(qrData: string): void;
  onConnectionUpdate(update: ConnectionUpdate): void;
  
  // Connection Management
  startQRConnection(): Promise<void>;
  stopQRConnection(): Promise<void>;
  
  // State Sync
  syncConnectionState(status: ExtendedSessionStatus): void;
}
```

### Pi Agent Integration

```typescript
interface IPiQRIntegration {
  // Agent Communication
  notifyQRStatus(status: PairingStatus): void;
  notifyConnectionReady(): void;
  
  // Command Handling
  handleQRCommand(command: string): Promise<void>;
  
  // Status Reporting
  reportPairingProgress(progress: PairingProgress): void;
}
```

## Testing Contracts

### Test Doubles

```typescript
interface IQRDisplayMock extends IQRCodeDisplay {
  // Test-specific methods
  simulateQRScan(): Promise<void>;
  simulateQRExpiry(): Promise<void>;
  simulateError(error: QRError): Promise<void>;
  getRenderHistory(): string[];
}

interface ITerminalMock extends IQRRenderer {
  // Test-specific methods
  getOutput(): string[];
  clearOutput(): void;
  setTerminalWidth(width: number): void;
  setUTF8Support(supported: boolean): void;
}
```

## Implementation Requirements

### Contract Compliance

1. **All implementations must implement the full interface**
2. **Method signatures must match exactly**
3. **Return types must be strictly typed**
4. **Error handling must follow QRError contract**
5. **Event emission must follow QREventMap structure**

### Backward Compatibility

1. **Existing WhatsAppService methods must remain unchanged**
2. **New interfaces must extend existing functionality**
3. **Configuration must be backward compatible**
4. **Error codes must not conflict with existing codes**

### Performance Requirements

1. **QR rendering must complete within 100ms**
2. **QR refresh must not block main thread**
3. **Memory usage must not increase during QR display**
4. **Event handlers must not throw exceptions**
