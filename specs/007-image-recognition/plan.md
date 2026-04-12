# Implementation Plan - Image Recognition Support

Enable the Pi Agent to "see" images sent via WhatsApp by downloading and forwarding them as base64 attachments.

## User Review Required

> [!IMPORTANT]
> The agent must be using a model that supports vision (e.g., Claude 3.5 Sonnet, GPT-4o, Gemini 1.5 Pro).

- Does the current model in use support image input? (Handled by Pi, but worth noting)
- Are there any size limits for base64 images in Pi's `sendUserMessage`? (Usually handled by Pi)

## Proposed Changes

### Integration

#### [whatsapp-pi.ts](../../whatsapp-pi.ts)
- Update `setMessageCallback` to detect `imageMessage`.
- Implement image downloading using `@whiskeysockets/baileys`.
- Forward images to Pi using `pi.sendUserMessage` with content array format.

## Verification Plan

### Automated Tests
- N/A (requires real WhatsApp interaction or heavy mocking of Baileys socket)

### Manual Verification
1. Start `whatsapp-pi` extension.
2. Send an image to the paired WhatsApp account.
3. Verify the agent receives the image and can describe its content.
4. Verify captions are also forwarded.
