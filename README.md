<p align="center">
  <img src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" alt="WhatsApp Logo" width="100">
</p>

# WhatsApp-Pi

A WhatsApp integration extension for the **[Pi Coding Agent](https://github.com/mariozechner/pi-coding-agent)**. 

[![GitHub](https://img.shields.io/badge/github-repo-black.svg?style=flat-square&logo=github)](https://github.com/RaphaCastelloes/whatsapp-pi)

Pi is a powerful agentic AI coding assistant that operates in your terminal. This extension allows you to chat and pair-program with your Pi agent directly through WhatsApp, featuring message filtering, allow-listing, and reliable message delivery.

## Features

- **Manual WhatsApp Connection**: QR code-based authentication with session persistence
- **Allow List**: Control which numbers can interact with Pi
  - Add contacts with optional names for easy identification
  - View ignored numbers (not in allow list) and add them when needed
- **Reliable Messaging**: Queue-based message sending with retry logic
- **TUI Integration**: Menu-driven interface for managing connections and contacts
- **Media Support**: 
  - **Vision Analysis**: Automatically forwards WhatsApp images to Pi for analysis.
  - **Document Handling**: Downloads and stores documents (PDF, text) for agent access.

## Prerequisites

To enable audio transcription features:
```bash
python -m pip install -U openai-whisper
```

To enable PDF reading capabilities (required for the agent to process documents):
- **Linux**: `sudo apt-get install poppler-utils`
- **macOS**: `brew install poppler`
- **Windows**: Install `poppler` (e.g., via Scoop) and add to PATH.

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
pi --whatsapp-pi-online
```

3. Use the menu to connect WhatsApp and manage allowed/blocked numbers

## Development / Testing

If you are developing or testing the extension locally, you can clone the repository from [GitHub](https://github.com/RaphaCastelloes/whatsapp-pi):

1. Clone and install dependencies:
```bash
git clone https://github.com/RaphaCastelloes/whatsapp-pi.git
cd whatsapp-pi
npm install
```

2. Run the extension:
```bash
pi -e whatsapp-pi.ts
```

For verbose mode (shows Baileys trace logs for debugging):
```bash
pi -e whatsapp-pi.ts --verbose
```

## Commands

- `/whatsapp` - Open the WhatsApp management menu

### Main Menu Options
- **Connect / Reconnect WhatsApp** - Start WhatsApp connection using saved credentials when available; QR code appears only if pairing is required
- **Disconnect WhatsApp** - Stop WhatsApp connection
- **Logoff (Delete Session)** - Remove all credentials and session data
- **Allowed Numbers** - Manage contacts that can interact with Pi
- **Blocked Numbers** - View ignored numbers and manage them

### Allowed Numbers Management
- **Add Number** - Add a new contact to the allow list (format: +5511999999999)
- **Select a contact** - Open a submenu with **Send Message**, **Remove Number**, and **Back**
- **Back** - Return to main menu

### Blocked Numbers Management
- **View List** - See all numbers that have been ignored (not in allow list)
- **Allow** - Move a blocked number to the allowed list
- **Delete** - Remove a number from the blocked list
- **Back** - Return to main menu

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
- `005-verbose-mode-support/` - Logging and tracing
- `006-auto-connect-flag/` - Automatic connection support
- `007-image-recognition/` - Vision analysis integration
- `008-document-message-support/` - Document handling and storage
- `009-localize-system-messages/` - US English localization

## Development

Run tests:
```bash
npm test
```

## Implementation Notes

### Recent Feature Updates (2026-04)

- **Auto-Connect Support**: Use the `--whatsapp-pi-online` flag to automatically connect to WhatsApp on startup if you have a valid active session.
- **Vision Analysis**: Images sent via WhatsApp are automatically downloaded and forwarded to the Pi agent as base64, enabling vision-based interactions.
- **Document Message Support**: 
  - WhatsApp documents (PDFs, text files, etc.) are downloaded and saved to `./.pi-data/whatsapp/documents/`.
  - The Pi agent receives a notification with the file path and metadata.
- **Full US-English Localization**: All user-facing menus, TUI notifications, console logs, and agent communication headers have been localized to `en-US` for a consistent experience.
- **Intelligent Message Filtering**: 
  - **Loop Prevention**: The bot automatically ignores any message ending with the `π` symbol, preventing infinite loops between instances.
  - **Manual Interaction**: Users can now interact with the bot from their own WhatsApp account; the bot will process `fromMe` messages as long as they don't contain the bot's signature.
- **Storage Management**: All persistent data (auth state, documents, config) is centralized in the `.pi-data/` directory.
