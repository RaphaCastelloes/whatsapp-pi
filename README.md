<p align="center">
  <img src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" alt="WhatsApp Logo" width="100">
</p>

# WhatsApp-Pi

A WhatsApp integration extension for the **[Pi Coding Agent](https://github.com/mariozechner/pi-coding-agent)**. 

Pi is a powerful agentic AI coding assistant that operates in your terminal. This extension allows you to chat and pair-program with your Pi agent directly through WhatsApp, featuring message filtering, allow-listing, and reliable message delivery.

## Features

- **Manual WhatsApp Connection**: QR code-based authentication with session persistence
- **Allow List**: Control which numbers can interact with Pi
  - Add contacts with optional names for easy identification
  - View ignored numbers (not in allow list) and add them when needed
- **Reliable Messaging**: Queue-based message sending with retry logic
- **TUI Integration**: Menu-driven interface for managing connections and contacts

## Quick Start

1. Install the extension:
```bash
pi install npm:whatsapp-pi
```

2. Start Pi (the extension will load automatically once installed):
```bash
pi
```

To automatically connect to WhatsApp on startup (if you are already authenticated):
```bash
pi -w
# or
pi --whatsapp
```

3. Use the menu to connect WhatsApp and manage allowed/blocked numbers

## Development / Testing

If you are developing or testing the extension locally:

1. Install dependencies:
```bash
npm install
```

2. Run the extension:
```bash
pi -e whatsapp-pi.ts
```

For verbose mode (shows Baileys trace logs for debugging):
```bash
pi -e whatsapp-pi.ts -v
# or
pi -e whatsapp-pi.ts --verbose
```

## Commands

- `/whatsapp` - Open the WhatsApp management menu
  - **Allow Numbers**: Manage contacts that can interact with Pi
  - **Blocked Numbers**: View ignored numbers (not in allow list) and add them to allow list

## Important Configuration

### Using Your Own WhatsApp Number

If you're using your **own WhatsApp number** (not a separate bot number), you need to modify the message filtering in `src/services/whatsapp.service.ts`:

**Remove this line from `handleIncomingMessages()`:**
```typescript
// Ignore messages sent by the bot itself
if (msg.key.fromMe) return;
```

**Why?** When using your own number:
- Pi sends messages from your account (marked with `π` symbol)
- The `fromMe` filter blocks ALL your outgoing messages, including Pi's responses
- The `π` symbol check is sufficient to prevent message loops

**Keep this check:**
```typescript
// Ignore messages sent by Pi (marked with π)
const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
if (text.endsWith('π')) return;
```

This ensures Pi doesn't process its own sent messages while still receiving messages from others.

## Project Structure

```
src/
├── models/          # Type definitions
├── services/        # Core services (WhatsApp, Session, MessageSender)
└── ui/              # Menu handlers

specs/               # Feature specifications
tests/               # Unit and integration tests
```

## Documentation

See `specs/` directory for detailed feature documentation:
- `001-whatsapp-tui-integration/` - TUI menu system
- `002-manual-whatsapp-connection/` - Connection management
- `003-whatsapp-messaging-refactor/` - Reliable messaging
- `004-blocked-numbers-management/` - Block list feature

## Development

Run tests:
```bash
npm test
```

Lint:
```bash
npm run lint
```
