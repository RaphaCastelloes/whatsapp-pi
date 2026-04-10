# Research: WhatsApp TUI Integration

## Decision: ANSI QR Rendering
- **Selected**: `qrcode-terminal`
- **Rationale**: It is the industry standard for rendering QR codes in Node.js terminal applications. It supports ANSI blocks which matches the requirement FR-002.
- **Alternatives considered**: `qrcode` (standard library) + custom ANSI mapper. Rejected as `qrcode-terminal` is specialized for this.

## Decision: Session Persistence
- **Selected**: Baileys `useMultiFileAuthState`
- **Rationale**: Recommended by Baileys documentation for multi-device support. It stores credentials as individual JSON files, which is easy to manage and delete upon "Logoff" (FR-006).
- **Alternatives considered**: Single file state. Rejected as it's less robust and harder to debug.

## Decision: Pi Extension Menu Integration
- **Selected**: Pi TUI extension hooks
- **Rationale**: Based on `extensions.md`, the Pi Agent allows registering commands like `/whatsapp`. We will use the TUI API to render the Login/Connect/Disconnect/Logoff menu.
- **Alternatives considered**: Custom CLI. Rejected as it should integrate with the existing Pi TUI.

## Decision: Message Interception
- **Selected**: Baileys `messages.upsert` socket event
- **Rationale**: This is the primary event for incoming messages. We will check the "Connect" status and "Allow List" before passing the message to the Agent's core logic.
- **Alternatives considered**: None. This is the standard Baileys pattern.
