# Data Model: WhatsApp Messaging

**Feature**: Refactor WhatsApp message sending
**Date**: 2026-04-10

## Entities

### MessageRequest
Represents a request to send a message.
- `recipientJid`: string (e.g., "123456789@s.whatsapp.net")
- `text`: string (message content)
- `options`: 
    - `maxRetries`: number (default: 3)
    - `priority`: 'high' | 'normal' (default: 'normal')

### MessageResult
Represents the outcome of a send operation.
- `success`: boolean
- `messageId`: string | null
- `error`: string | null
- `attempts`: number

## State Transitions

1. **Pending**: Message is queued and waiting for connection.
2. **Sending**: Attempting to send via Baileys.
3. **Sent**: Successfully acknowledged by WhatsApp servers.
4. **Failed**: Permanent failure or max retries reached.
5. **Retrying**: Waiting for backoff before next attempt.
