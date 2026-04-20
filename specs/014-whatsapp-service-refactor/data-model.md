# Data Model: WhatsApp Service Refactor

**Feature**: `014-whatsapp-service-refactor`  
**Date**: 2026-04-20

## Entities

### 1) WhatsApp Service State
Represents the observable lifecycle state of the WhatsApp integration.

**Fields**
- `status`: one of `logged-out`, `pairing`, `connected`, or `disconnected`
- `isReconnecting`: whether a reconnect attempt is currently in progress
- `hasSocket`: whether an active socket exists
- `lastRemoteJid`: last accepted inbound remote JID, if any
- `verboseMode`: whether verbose logging is enabled

**Validation Rules**
- `status` must always be one of the supported session statuses.
- A connected status without an active socket is treated as effectively disconnected.
- Reconnect attempts must not be started twice concurrently.

**State Transitions**
- `pairing` → `connected` when a QR-based pairing succeeds.
- `connected` → `disconnected` when the socket closes without a logged-out condition.
- `connected` → `logged-out` when the session is invalid or manually logged out.
- `connected` → `pairing` when a saved session is rejected and fallback pairing is allowed.

### 2) Connection Event
Represents a socket lifecycle notification that drives status changes.

**Fields**
- `connection`: open/close/undefined
- `lastDisconnect`: optional error payload from the socket
- `qr`: optional pairing QR code

**Validation Rules**
- A `qr` value always implies the service should enter pairing mode.
- A close event must be classified into reconnect, logged-out, conflict, or final disconnect behavior.

### 3) Incoming Message
Represents a WhatsApp message delivered to the service for processing.

**Fields**
- `id`: unique message id
- `remoteJid`: source contact JID
- `pushName`: optional display name
- `text`: resolved message text
- `timestamp`: message time

**Validation Rules**
- Messages without a remote JID are ignored.
- Messages marked as Pi-generated are ignored.
- Group messages are ignored by the current service contract.
- Messages from blocked or disallowed contacts are not forwarded to the main callback.

### 4) Outgoing Message Request
Represents a message send request sent by the application.

**Fields**
- `recipientJid`: target JID
- `text`: message body
- `options`: retry or priority preferences, when present

**Validation Rules**
- Requests require a non-empty recipient JID and message text.
- Sends only proceed when the service is connected.

### 5) Outgoing Message Result
Represents the outcome of a send attempt.

**Fields**
- `success`: whether delivery completed successfully
- `messageId`: returned identifier when successful
- `error`: human-readable failure reason when unsuccessful
- `attempts`: number of delivery attempts used

**Validation Rules**
- Successful results must contain a message identifier.
- Failed results must contain an error message.
- Attempt counts must be at least 1 for all send attempts.

## Relationships

- The **WhatsApp Service State** reacts to each **Connection Event**.
- Each **Incoming Message** may be recorded and filtered before reaching downstream handling.
- Each **Outgoing Message Request** produces an **Outgoing Message Result**.

## Notes

This refactor does not introduce new domain entities; it clarifies and isolates the existing ones already present in the service layer.
