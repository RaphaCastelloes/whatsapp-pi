<p align="center">
  <img src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" alt="WhatsApp Logo" width="100">
</p>

# WhatsApp-Pi
[![GitHub](https://img.shields.io/badge/github-repo-black.svg?style=flat-square&logo=github)](https://github.com/RaphaCastelloes/whatsapp-pi)

A WhatsApp integration extension for the **[Pi Coding Agent](https://github.com/mariozechner/pi-coding-agent)**. 

Pi is a powerful agentic AI coding assistant that operates in your terminal. This extension lets you chat and pair-program with your Pi agent through WhatsApp, with message filtering, allowed contacts/groups, recents/history browsing, message detail/reply, group-only binding, and reliable message delivery.


## Features

- **Manual WhatsApp Connection**: QR code-based authentication with session persistence
- **Allowed Contacts**: Control which phone numbers can interact with Pi
  - Add contacts with optional names for easy identification
  - View ignored numbers (not yet allowed) and add them when needed
  - Manage aliases and print allowed contacts from the menu
- **Allowed Groups**: Control which WhatsApp groups can interact with Pi
  - Add group JIDs with optional aliases
  - Only groups in Allowed Groups are processed by the agent
- **Recents & History**: Browse recent conversations, inspect full message history, and reply from message detail view
- **Reliable Messaging**: Queue-based message sending with retry logic
- **TUI Integration**: Menu-driven interface for managing connections, contacts, and recent chats
- **Group-Only Mode**: Bind the agent to a single WhatsApp group with `--whatsapp-group`
- **Media Support**: 
  - **Vision Analysis**: Automatically forwards WhatsApp images to Pi for analysis.
  - **Audio Transcription**: Transcribes voice notes when Whisper is installed.
  - **Document Handling**: Downloads and stores documents (PDF, text) for agent access; PDFs include a bounded text preview when readable.

## Prerequisites

To enable audio transcription features:
```bash
python -m pip install -U openai-whisper
```

PDF documents are parsed locally and do not require extra system utilities.
If a PDF cannot be parsed automatically, it is still saved and forwarded with a clear fallback notice.

## Quick Start

1. Install the extension:
```bash
pi install npm:whatsapp-pi
```

2. Start Pi:
```bash
pi
```

3. Open `/whatsapp` and choose **Connect / Reconnect WhatsApp**.
   - QR appears only on first pair or after logoff.

4. Add the chat you will use with Pi to **Allowed Contacts** or **Allowed Groups**.

5. Send a message from that allowed chat to Pi.
   - Pi replies in same thread.
   - Use **Recents** only to browse history or reply manually.

After first pairing, you can start Pi with auto-connect enabled:
```bash
pi --whatsapp-pi-online
```

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

To test startup auto-connect locally after you have already paired WhatsApp:
```bash
pi -e whatsapp-pi.ts --whatsapp-pi-online
```

## How It Works

- Pi processes **incoming** messages only from allowed contacts or allowed groups.
- **Recents** is history browser, not trigger.
- **Send Message** and `send_wa_message` are outbound only.
- If you message yourself, WhatsApp may show sent/read ticks, but that does not guarantee Pi will treat it as a trigger.

## WhatsApp Numbers and JIDs

- Contacts use phone format in UI: `+5511999999999`
- Internally, contacts map to JIDs like `5511999999999@s.whatsapp.net`
- Groups use JIDs like `120363012345@g.us`
- Recents may show normalized values from WhatsApp, so use **Print Contact** / **Print Group JID** and aliases to avoid confusion.

## Commands

- `/whatsapp` - Open the WhatsApp management menu

### Main Menu Options
- **Connect / Reconnect WhatsApp** - Start WhatsApp connection using saved credentials when available; QR code appears only if pairing is required
- **Disconnect WhatsApp** - Stop WhatsApp connection
- **Logoff (Delete Session)** - Remove all credentials and session data
- **Recents** - Open recent conversations, view history, and reply
- **Allowed Contacts** - Manage contacts that can interact with Pi
- **Allowed Groups** - Manage WhatsApp groups that can interact with Pi

### Allowed Contacts Management
- **Add Contact** - Add a new contact to the allowed contacts list (format: +5511999999999)
- **Select a contact** - Open a submenu with **History**, **Send Message**, **Print Contact**, alias actions, **Remove Contact**, and **Back**
- **Back** - Return to main menu

### Allowed Groups Management
- **Add Group** - Add a WhatsApp group JID to the allowed groups list (format: 120363012345@g.us)
- **Select a group** - Open a submenu with **History**, **Send Message**, **Print Group JID**, alias actions, **Remove Group**, and **Back**
- **Back** - Return to main menu

### Recents Management
- **History** - Open full message history for that conversation
- **Send Message** - Send a new message without Pi suffix
- **Reply** - Open message detail, then press `R` to reply
- **Allow Contact / Allow Group** - Move a recent sender into the appropriate allowed list
- **Remove Alias** - Clear saved alias for that sender
- **Back** - Return to main menu

## Project Structure

```
src/
├── models/          # Type definitions
├── services/        # Core services (WhatsApp, Session, Recents, Media)
└── ui/              # Menu handlers and TUI views

tests/
└── unit/            # Unit tests
```

## Development

Run tests:
```bash
npm test
```

## Implementation Notes

### Recent Feature Updates (2026-05)

- **Auto-Connect Support**: Use the `--whatsapp-pi-online` flag to connect on startup when credentials already exist.
- **Group-Only Mode**: Use `--whatsapp-group <jid>` to bind Pi to a single WhatsApp group. The group must also be present in Allowed Groups.
- **Recents Store**: Recent conversations and message history are persisted in `~/.pi/whatsapp-pi/recents/recents.json`.
- **Message Detail / Reply**: Open a message from history to inspect full content and reply with `R`.
- **Media Support**: Images are forwarded for vision analysis, audio is transcribed with Whisper, and PDFs are saved under `./.pi-data/whatsapp/documents/` with local text preview when available.
- **Session Handling**: Saved state, allow list, and startup reconnects are restored automatically when available.
- **Intelligent Message Filtering**: Messages ending with `π` are ignored to prevent bot loops.
- **Storage Management**: Persistent data lives under `.pi-data/` plus the recents store in the user home directory.
