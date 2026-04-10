# Research: WhatsApp Message Sending Reliability

**Feature**: Refactor WhatsApp message sending
**Date**: 2026-04-10

## Unknowns & Investigations

### Investigation 1: Baileys Message Delivery Feedback
- **Question**: How does `baileys` notify about delivery success or failure?
- **Finding**: The `sendMessage` method returns a `proto.WebMessageInfo` object. However, "delivery" (reaching the recipient) is notified via the `messages.update` event (status: DELIVERED, READ). For this refactor, we focus on "Sent" (reached WhatsApp servers).
- **Decision**: We will consider a message "Sent" when `sendMessage` resolves. We will use `messages.update` to log delivery reports if needed, but primary focus is on the send operation success.

### Investigation 2: Connection State Awareness
- **Question**: How can the sender know if the socket is ready to send?
- **Finding**: `WhatsAppService` tracks connection status. The sender should check if status is `connected`. If not, it should either wait (buffer) or fail with a specific error.
- **Decision**: Implement a `waitIfOffline` mechanism with a timeout.

### Investigation 3: Retry Logic
- **Question**: What is the best way to handle retries for transient failures?
- **Finding**: Simple exponential backoff is recommended.
- **Decision**: Implement a retry loop (max 3 attempts) for `ECONNRESET` or similar transient network errors.

## Consolidation

- **Decision**: Introduce `MessageSender` service.
- **Rationale**: Separates the complex logic of retries, connection waiting, and queuing from the socket management in `WhatsAppService`.
- **Alternatives considered**: Adding logic to `WhatsAppService`. Rejected to avoid a "God Class" and maintain SOLID principles.
