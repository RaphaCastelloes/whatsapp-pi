# Data Model: WhatsApp TUI Integration

## Entities

### WhatsAppSession
- `id`: string (e.g., "default")
- `status`: 'logged-out' | 'pairing' | 'connected' | 'disconnected'
- `credentialsPath`: string (path to auth files)

### AllowList
- `numbers`: string[] (E.164 format)

### Message
- `id`: string
- `remoteJid`: string
- `pushName`: string
- `text`: string
- `timestamp`: number

## State Transitions

- **logged-out** -> **pairing** (Command: Login)
- **pairing** -> **connected** (QR Scan Success)
- **connected** -> **disconnected** (Command: Disconnect)
- **disconnected** -> **connected** (Command: Connect)
- **connected/disconnected** -> **logged-out** (Command: Logoff)

## Validation Rules
- Phone numbers MUST start with `+` and contains only digits after (regex: `^\+[1-9]\d{1,14}$`).
