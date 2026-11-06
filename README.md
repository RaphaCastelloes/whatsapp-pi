<p align="center">
  <img src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" alt="WhatsApp logo" width="88">
</p>

# WhatsApp-Pi

[![GitHub](https://img.shields.io/badge/GitHub-repository-black?style=flat-square&logo=github)](https://github.com/RaphaCastelloes/whatsapp-pi)
[![npm version](https://img.shields.io/npm/v/whatsapp-pi?style=flat-square)](https://www.npmjs.com/package/whatsapp-pi)

WhatsApp-Pi connects [Pi Coding Agent](https://pi.dev) to WhatsApp. Chat with your Pi agent from an allowed contact or group, browse local conversation history, and let Pi send messages or reactions.

## Features

- Pair a WhatsApp account with a QR code; credentials persist locally.
- Choose which contacts and groups can trigger the agent. Manage numbers, aliases, and group JIDs in Pi’s `/whatsapp` menu.
- Browse recents and message history, then reply from the TUI.
- Send WhatsApp messages and reactions with Pi tools.
- Process incoming images for vision, transcribe voice notes locally with Whisper.cpp, and download documents for agent access. PDFs get a bounded text preview when readable.
- Optionally bind an agent instance to one group with `--whatsapp-group <jid>`.

## Requirements

- [Pi Coding Agent](https://pi.dev) and a configured model provider. Use `/login` in Pi or configure the provider’s API key.
- Node.js 20+ when installing Pi through npm or developing locally.
- For voice-note transcription: FFmpeg and a built Whisper.cpp `whisper-cli`. Other features do not require the Whisper CLI.

Install Pi using the [official instructions](https://pi.dev/docs/latest), then install this extension:

```sh
pi install npm:whatsapp-pi
```

## Connect WhatsApp

1. Start Pi and run `/whatsapp`.
2. Choose **Connect / Reconnect WhatsApp** and scan the QR code if prompted.
3. Add the contact or group that should be able to trigger Pi under **Allowed Contacts** or **Allowed Groups**.
4. Send a message from that chat. Pi replies in the same conversation.

After pairing, `pi --whatsapp-pi-online` starts with automatic connection when saved credentials are available. To bind this Pi instance to one group, pass its JID with `--whatsapp-group <jid>`.

### Voice-note transcription (optional)

The build scripts fetch and compile Whisper.cpp. Run from a local checkout:

```sh
# Linux/macOS (requires CMake and a C++ build toolchain)
npm install
./scripts/build-whisper-cli.sh

# Windows PowerShell (requires Git, CMake, and a C++ build toolchain)
npm install
./scripts/build-whisper-cli.ps1
```

The extension searches `vendor/whisper.cpp/build/bin` (and the Windows Release subdirectory). Set `WHISPER_CLI_PATH` to use a CLI at another location. FFmpeg converts WhatsApp audio to 16 kHz mono WAV before transcription. Transcription is local and does not need a transcription API key.

## Permissions and local data

Only incoming messages from allowed contacts and groups are sent to the Pi agent. The `/whatsapp` **Recents** view is for browsing history; a message appearing there does not trigger the agent. Sending a message to yourself may show WhatsApp delivery ticks without triggering Pi.

The extension stores WhatsApp credentials, configuration, recents, logs, and media locally under:

```text
~/.pi/agent/extensions/whatsapp-pi/
```

On first initialization, existing data from `~/.pi/agent/extension/whatsapp-pi/` and `~/.pi/whatsapp-pi/` is copied into the current storage location where files do not already exist. Documents are kept with local media. Keep this directory private because it includes authentication credentials and conversation data.

## Pi menu

Run `/whatsapp` to manage the connection and allowed chats:

- **Connect / Reconnect**, **Disconnect**, and **Logoff (Delete Session)** manage the linked WhatsApp session.
- **Allowed Contacts** and **Allowed Groups** control which chats can trigger the agent; entries support aliases and history views.
- **Recents** lists conversations, opens message history, allows a sender, or starts a manual reply. In message detail, press `R` to reply.
- **Send Message** from a contact, group, or recent conversation sends a one-off message without invoking the agent.

WhatsApp chat commands `/compact` and `/abort` compact the current Pi context and abort the current Pi operation, respectively.

## Pi tools

| Tool | Purpose |
| --- | --- |
| `send_wa_message` | Send a message. Omit `jid` to reply to the active/last WhatsApp conversation; provide a known JID for another recipient. |
| `send_reaction` | React to a WhatsApp message with an emoji. |
| `list_wa_conversations` | Read recent conversation summaries, with filters for incoming and allowed chats. |
| `get_wa_conversation_history` | Read recent messages for a sender number or JID. |
| `check_wa_new_messages` | Find conversations whose latest message is incoming, optionally since a timestamp. |

The three conversation lookup tools read the local recents store and do not access WhatsApp’s network or mark messages as read.

## Run on Ubuntu at login

The optional systemd user service installer requires `tmux`, `systemd`, and an installed `pi` command. From a checkout:

```sh
sudo apt install tmux
./scripts/install-whatsapp-pi-service.sh
```

Useful commands:

```sh
tmux attach -t whatsapp-pi
systemctl --user status whatsapp-pi.service
systemctl --user disable --now whatsapp-pi.service
```

## Develop

```sh
git clone https://github.com/RaphaCastelloes/whatsapp-pi.git
cd whatsapp-pi
npm install
npm test
npm run lint
npm run typecheck
```

For a local extension checkout, run `pi -e whatsapp-pi.ts`. On Windows, `./scripts/launch-pi.ps1` starts the local entry point. Add `--verbose` to print detailed Baileys and audio timing logs.

## License

MIT. See [LICENSE](LICENSE).
