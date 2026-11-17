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
- Send WhatsApp messages and reactions with Pi tools. Sending is connection-aware, with stable message IDs, bounded pre-transmission retries, and explicit uncertain outcomes.
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

## Trusted chats and reply routing

All allowed chats share the **same Pi model context**. Allow only mutually trusted people/groups; correct reply routing is not conversation privacy isolation.

Incoming prompts include an opaque request marker. It identifies an exact extension-submitted input in a bounded, memory-only registry; it is not a routing command. Pi's normal user-input policies still run. Ownership activates only when matching content is consumed, not when a chat message arrives.

Automatic replies wait until tool results are available. They never reuse a stale WhatsApp destination for terminal-only work. Combined inputs from different chats, unknown input, or policy/runtime-transformed content (including changed image bytes) fail closed: an agent must use an explicit known recipient rather than guess. Verified PN/LID aliases do not replace the original transport address of a reply.

An admitted batch and its pending preparation retain an account/auth scope and session generation. Account changes, logout or explicit stop discard stale unsubmitted work rather than submitting it through a new account. Same-account reconnects preserve admitted batch work; mapping results and callbacks from obsolete sockets are ignored. These guards do not recall a send that has already started.

Every eligible batch item is considered. History/append events and request-ID-bearing resends do not trigger ordinary agent work. A delayed normal `notify` event without a request ID can still trigger work. Replay protection is bounded to 5,000 entries/24 hours in the running process; eviction/restart ends that protection. There is no durable agent-job replay, and a crash during handoff can lose a request. Retry manually by sending a fresh WhatsApp message, not by automatically resending an uncertain outbound send.

Ordinary incoming text ending in `π` is accepted. The legacy branding filter applies only to own-direction messages; registered outgoing IDs provide additional echo protection.

Full message keys and permitted raw content are cached in memory for at most 500 messages/24 hours, or earlier protocol expiry. Reactions require an unambiguous retained target; optional `fromMe`/`participant` hints disambiguate stored keys. Missing targets return an error rather than inventing a group participant or message direction. View-once payloads are excluded from this new cache; these limits do not erase existing Pi transcripts, logs, or downloaded media.

A successful socket send means **accepted**, not delivered/read by the recipient. An undefined result or transport failure after transmission starts returns `delivery: "unknown"` with the stable message ID when available. Do not resend automatically; the first send may still arrive.

## Pi tools

| Tool | Purpose |
| --- | --- |
| `send_wa_message` | Send text to a known recipient, or omit `jid` for the uniquely owned current conversation. Idle manual calls retain last-conversation/operator fallback. |
| `send_wa_media` | Explicit local document/image/audio/voice-note/video sending with validation, bounded conversion and optional native quote. |
| `send_reaction` | React to a retained, unambiguous message key; optional `fromMe`/`participant` hints and compound emoji are supported. |
| `list_wa_conversations` | Read recent conversation summaries, with filters for incoming and allowed chats. |
| `get_wa_conversation_history` | Read recent messages for a sender number or JID. |
| `check_wa_new_messages` | Find conversations whose latest message is incoming, optionally since a timestamp. |

The three conversation lookup tools read the local recents store and do not access WhatsApp’s network or mark messages as read.

## Sending Files and Native Replies

`send_wa_media` requires `path` and `type` (`document`, `image`, `audio`, or `video`). It accepts optional `jid`, `caption`, `voiceNote` (audio only), and `quote`. Like text sends, an omitted recipient requires unique current WhatsApp ownership during an agent run.

```json
{"path":"reports/example.pdf","type":"document","jid":"15550000001@s.whatsapp.net","caption":"Requested report"}
```

- Files must resolve under the current Pi workspace (`ctx.cwd`) or the extension's `whatsapp-medias` directory. Symlink escapes, ancestor replacement, URLs/base64, empty/nonregular files, credential/auth folders, `.env*`, private-key names and detected private-key headers are rejected. Opened descriptor identity, non-symlink ancestry and file stability are checked before and after copying; nonblocking open rejects FIFO replacement without wedging a worker. This is an egress policy, not an OS sandbox or general secret scanner.
- The application limit is **25 MiB**, checked on the source, bounded snapshot copy and converted output. Only owned temporary snapshots are removed; originals are never edited or deleted. Local paths inside Baileys' payload refer to these snapshots and are streamed from disk. Tool results contain metadata, not attachment bytes.
- Documents include PDF, XLSX, Markdown and other regular files with filename/MIME metadata (unknown extensions use `application/octet-stream`). Images support JPEG and PNG signatures.
- Images, audio and video require FFmpeg for bounded thumbnail generation or codec inspection, even when payload conversion is unnecessary. Resolution uses `FFMPEG_PATH`, otherwise the system executable, then the existing `ffmpeg-static` path if available. No automatic installation occurs.
- MP3, AAC-in-MP4 and Ogg/Opus audio send directly when compatible. WAV/FLAC and other supported binary audio containers convert to AAC/M4A. `voiceNote: true` sends Ogg/Opus with the PTT flag, converting when necessary. Audio captions are rejected instead of silently dropped.
- Compatible MP4/H.264/yuv420p with optional AAC audio sends directly. Other supported MP4/MOV, AVI or Matroska/WebM video converts to MP4/H.264/AAC. Text playlists and network input protocols are not accepted. Codec support depends on the installed FFmpeg build.
- Probe, conversion and thumbnail generation share a **60-second budget**. Duration and JPEG thumbnails are prepared explicitly so Baileys does not recreate plaintext in a shared temp directory or launch an unbounded thumbnail child. PTT waveform data is explicitly unavailable instead of invoking Baileys' unowned audio decoder. Abort/timeout terminates the child, escalates to a forced kill if necessary, and waits for child exit before cleanup. Baileys receives `mediaUploadTimeoutMs: 60000`; it has no caller abort signal.
- Before transmission starts, abort prevents sending. After it starts, caller abort/timeout returns `delivery: "unknown"` without blind retry. The snapshot remains owned until the underlying consumer settles; late acceptance updates the in-memory outcome and records one successful recent entry. Already-started sends cannot be recalled.
- Mentioning a path in ordinary assistant text never triggers an upload. There is no TTS, GIF/sticker or album support in this change.

Both `send_wa_message` and `send_wa_media` accept an optional native quote:

```json
{"message":"Reply to the selected message","jid":"15550000001@s.whatsapp.net","quote":{"messageId":"OBSERVED_MESSAGE_ID","conversationJid":"15550000001@s.whatsapp.net","fromMe":false}}
```

Own-message group quotes whose observed author is a LID are explicitly unavailable with Baileys rc14, which would otherwise rewrite that author to the account's phone JID. Incoming LID-author quotes and ordinary incoming/own PN quotes have native serialization coverage.

Quote targets must be real, unambiguous messages retained by the current process in the same canonical chat. Add `participant` when needed for a group target. The original transport key is preserved, and configured send-number overrides cannot redirect a quote to another chat. Missing, deleted, unsupported or evicted targets fail explicitly; a requested quote is never silently omitted.

The existing history/detail/reply UI now sends native quotes and displays unavailable targets. Quoting lasts only within the **500-message/24-hour memory window**, or earlier protocol expiry. Restarting loses this raw lookup; older recents alone cannot manufacture a quote. Comprehensive persistent history and lifecycle reconciliation remain outside this change.

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
