<p align="center">
  <img src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" alt="WhatsApp Logo" width="100">
</p>

# WhatsApp-Pi
[![GitHub](https://img.shields.io/badge/github-repo-black.svg?style=flat-square&logo=github)](https://github.com/RaphaCastelloes/whatsapp-pi)

A WhatsApp integration extension for the **[Pi Coding Agent](https://pi.dev)**. 

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
- **Reliable Messaging**: Connection-aware sending with stable message IDs, bounded pre-transmission retries, and explicit uncertain outcomes
- **TUI Integration**: Menu-driven interface for managing connections, contacts, and recent chats
- **Group-Only Mode**: Bind the agent to a single WhatsApp group with `--whatsapp-group`
- **Media Support**: 
  - **Vision Analysis**: Automatically forwards WhatsApp images to Pi for analysis.
  - **Audio Transcription**: Transcribes voice notes locally with Whisper.cpp (`whisper-cpp-node`); `ffmpeg` is used to convert WhatsApp audio to 16 kHz mono WAV first.
  - **Document Handling**: Downloads and stores documents (PDF, text) for agent access; PDFs include a bounded text preview when readable.

## Prerequisites

### Pi Coding Agent

Install Pi from [pi.dev](https://pi.dev):

**Linux / macOS (recommended):**
```bash
curl -fsSL https://pi.dev/install.sh | sh
```

**Or via npm (requires Node.js 20+):**
```bash
npm install -g @earendil-works/pi-coding-agent
```

Then authenticate or set an API key before starting:
```bash
# Use /login inside Pi for subscription providers, or set an API key:
export ANTHROPIC_API_KEY=sk-ant-...
# OpenAI
export OPENAI_API_KEY=sk-...
# Google Gemini
export GEMINI_API_KEY=...
```

See the [Pi documentation](https://pi.dev/docs/latest) for full setup, providers, and model configuration details.

### Audio Transcription

Audio transcription uses a local `whisper.cpp` CLI and FFmpeg; no transcription API key is required.

Install dependencies and build the Whisper CLI:

**Linux/macOS:**
```bash
npm install
./scripts/build-whisper-cli.sh
```

**Windows (PowerShell):**
```powershell
npm install
./scripts/build-whisper-cli.ps1
```

The CLI is expected at `vendor/whisper.cpp/build/bin/whisper-cli` (or `.exe` on Windows). To use another location, set `WHISPER_CLI_PATH`.

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

### Iniciar automaticamente no Ubuntu

Com `tmux` instalado, o instalador abaixo instala `whatsapp-pi` no agente Pi do usuário e cria um serviço systemd que inicia `pi --whatsapp-pi-online` em um tmux no boot:

```bash
sudo apt install tmux
./scripts/install-whatsapp-pi-service.sh
```

Comandos úteis:
```bash
tmux attach -t whatsapp-pi
systemctl --user status whatsapp-pi.service
systemctl --user disable --now whatsapp-pi.service
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

**Linux/macOS:**
```bash
pi -e whatsapp-pi.ts
```

**Windows (PowerShell):**
```powershell
./scripts/launch-pi.ps1
```

For verbose mode (shows Baileys trace logs and audio timing logs for debugging):
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

### Trusted Chats and Reply Routing

All allowed chats share the **same Pi model context**. Allow only mutually trusted people/groups; correct reply routing is not conversation privacy isolation.

Incoming prompts include an opaque request marker. It identifies an exact extension-submitted input in a bounded, memory-only registry; it is not a routing command. Pi's normal user-input policies still run. Ownership activates only when matching content is consumed, not when a chat message arrives.

Automatic replies wait until tool results are available. They never reuse a stale WhatsApp destination for terminal-only work. Combined inputs from different chats, unknown input, or policy/runtime-transformed content (including changed image bytes) fail closed: an agent must use an explicit known recipient rather than guess. Verified PN/LID aliases do not replace the original transport address of a reply.

An admitted batch and its pending preparation retain an account/auth scope and session generation. Account changes, logout or explicit stop discard stale unsubmitted work rather than submitting it through a new account. Same-account reconnects preserve admitted batch work; mapping results and callbacks from obsolete sockets are ignored. These guards do not recall a send that has already started.

Every eligible batch item is considered. History/append events and request-ID-bearing resends do not trigger ordinary agent work. A delayed normal `notify` event without a request ID can still trigger work. Replay protection is bounded to 5,000 entries/24 hours, with retained processing outcomes persisted in the selected account archive. Unfinished outcomes become interrupted on restart and are never automatically reissued; eviction ends that protection. There is no durable agent-job replay, and a crash during handoff can lose a request. Retry manually by sending a fresh WhatsApp message, not by automatically resending an uncertain outbound send.

Ordinary incoming text ending in `π` is accepted. The legacy branding filter applies only to own-direction messages; registered outgoing IDs provide additional echo protection.

Full message keys and permitted raw content are cached in memory for at most 500 messages/24 hours, or earlier protocol expiry. Reactions require an unambiguous retained target; optional `fromMe`/`participant` hints disambiguate stored keys. Missing targets return an error rather than inventing a group participant or message direction. View-once payloads are excluded from this new cache; these limits do not erase existing Pi transcripts, logs, or downloaded media.

A successful socket send means **accepted**, not delivered/read by the recipient. An undefined result or transport failure after transmission starts returns `delivery: "unknown"` with the stable message ID when available. Do not resend automatically; the first send may still arrive.

## LLM-Callable Tools

The extension registers the following tools that the Pi agent can call:

| Tool | Direction | Description |
| --- | --- | --- |
| `send_wa_message` | outbound | Send text to a known recipient, or omit `jid` for the uniquely owned current conversation. Idle manual calls retain last-conversation/operator fallback. |
| `send_wa_media` | outbound | Explicit local document/image/audio/voice-note/video sending with validation, bounded conversion and optional native quote. |
| `send_reaction` | outbound | React to a retained, unambiguous message key; optional `fromMe`/`participant` hints and compound emoji are supported. |
| `list_wa_conversations` | read-only | List recent conversations from the local recents store. Supports `onlyIncoming`, `onlyAllowed`, and `limit`. |
| `get_wa_conversation_history` | read-only | Get the most recent messages with a given `senderNumber` (accepts `+E164`, raw digits, or a JID). Supports `limit`. |
| `check_wa_new_messages` | read-only | List conversations whose most recent message is incoming (i.e. waiting for a reply). Supports `sinceTimestamp` (ms epoch) and local `scope`. |
| `request_wa_history` | explicit network / local status | `{mode:"request",jid,count?}` requests at most 100 older messages for an allowed/bound chat; `{mode:"status",requestId?}` reads retained status locally. |

The three inbox read tools use the selected local archive projection. They never fetch network history or mark messages as read. Defaults remain 20 items; `scope` selects a known local profile/account or `legacy-unassigned`. `list_wa_conversations` returns available scope IDs. `get_wa_conversation_history` also accepts an opaque `cursor` and returns `nextCursor` for older local pages, including equal-timestamp records.

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

Quote targets must be real, unambiguous messages retained in the current account's canonical chat. Add `participant` when needed for a group target. The original transport key is preserved, and configured send-number overrides cannot redirect a quote to another chat. Missing, deleted, unsupported or evicted targets fail explicitly; a requested quote is never silently omitted.

The history/detail/reply UI sends native quotes and displays unavailable targets. Full raw retry payloads remain memory-only within **500 messages/24 hours**, or earlier protocol expiry. Supported text/media quotes can instead use a retained secret-free projection after restart. Legacy recents, deleted/expired records and another account's local history view cannot manufacture a quote.

## Local Archive, History and Lifecycle

New ignored live senders retain at most 20 memory-only summary previews for 24 hours, scoped to the current account. Their content is not admitted to the new durable/quotable archive or raw retry cache.

The authoritative archive is under `~/.pi/agent/extensions/whatsapp-pi/archive/`. Each relative auth-directory profile has a random storage-profile ID and a last-verified account marker. Offline reads use that known account without a socket. A different login opens a separate partition before ingestion; an empty new account never falls back to someone else's legacy history. `/whatsapp > Local history scope` selects another known account or the legacy view locally without changing the live ingestion account. Recents remain available while disconnected.

Legacy `recents/recents.json` is not attributed to the next login. A one-time read-only `legacy-unassigned` import preserves existing labels/time/direction and an untouched `recents.json.pre-archive-backup`. The original recents file is not rewritten by the archive-backed projection. Legacy missing keys/content stay unknown and cannot supply quote/retry payloads.

New records preserve exact visible text, emoji/newlines, observed keys, millisecond timestamps, quote links and lifecycle metadata. Persistent quote projections allow only original visible text/caption/filename/MIME and message identity. Media keys, download/direct URLs, raw context, thumbnails, attachment bytes, auth and app-state secrets are excluded. View-once content is excluded, and disappearing expiry wins over archive retention. This does not erase existing Pi transcripts, logs or downloaded files.

Retention is **1,000 records per conversation, 30 days maximum age and 100 MiB per account partition including control metadata**. Serialized mutations use a single writer and same-directory atomic replacement, with owner-only files/backups (`0600`) and directories (`0700`) where supported. Concurrent writers for one partition are unsupported and rejected with a lock. Stale locks are reclaimed only when the recorded PID no longer exists. Corrupt/future-version stores and filesystem failures produce explicit degraded state, never an automatic reset. Stop other writers, preserve originals and investigate permissions/schema before recovery. Do not delete or replace an archive while a writer is running.

History network work requires an explicit `request_wa_history` call, a connected allowed/bound chat and a complete retained oldest-message anchor. Each request asks for 1–100 messages, with one active request per chat. Results start pending; a returned request ID is not returned history. Imported messages never trigger Pi prompts, document parsing, transcription or attachment downloads. Broader initial history sync is opt-in via `--whatsapp-history-full`; the default remains `syncFullHistory: false`, and authorization/retention limits still apply.

Correlation uses the installed Baileys fields: `peerDataRequestSessionId`, `syncType`, `progress`, `chunkOrder`, and upsert `requestId`. Native rc14 deliberately omits `isLatest` for on-demand chunks. Only an exact matching peer request ID with on-demand progress `100` completes that request. Global `messaging-history.status`, even explicit completion, has no request ID and cannot complete every pending request. After 60 seconds without correlated completion, status becomes unknown; disconnect/restart interrupts pending work without resubmission. Retained status lasts at most 24 hours/100 requests. Late authorized chunks may still import, but cannot bypass expiry, admission floors or account guards. WhatsApp/device availability can prevent full history retrieval.

Receipts, edits, revokes, local removals and participant reactions update the same records without ordinary agent prompts. Send acceptance is separate from server/delivery/read/playback observations. Group receipts remain per participant; missing/privacy-suppressed receipts stay unknown. The detail view and local tools expose observed status, edited/deleted markers, reactions and incomplete knowledge. Before-base updates are bounded to 500 entries/24 hours; losing required events is reported as incomplete rather than promising unlimited convergence.

Up to 5,000 content-free tombstones protect deletions for the accepted history window plus a day. Before protective metadata is evicted, monotonic conversation admission floors (or a conservative account-wide floor under byte pressure) reject covered older content on every ingest path, including delayed live notifications. Local chat deletion advances its floor to the observation time. Increasing retention does not lower a floor. Pressure can therefore reduce available history; it does not silently allow deleted content to resurrect. No outbound edit/delete/admin tool is added.

**Rollback:** stop the extension, preserve the new archive, and restore the old code and preserved old recents snapshot only after explicitly acknowledging that old code will not display post-migration messages. This is not a lossless downgrade and there is no automatic downgrade exporter. Leave the new archive untouched for recovery/re-upgrade. No real rollback or auth migration is performed by automated tests.

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
- **Select a contact** - Open a submenu with **History**, **Send Message**, **Print Contact**, **Add Alias**, **Remove Alias**, **Add Number**, **Remove Number**, **Remove Contact**, and **Back**
- **Back** - Return to main menu

### Allowed Groups Management
- **Add Group** - Add a WhatsApp group JID to the allowed groups list (format: 120363012345@g.us)
- **Select a group** - Open a submenu with **History**, **Send Message**, **Print Group JID**, **Add Alias**, **Remove Alias**, **Remove Group**, and **Back**

### Recents Management
- **History** - Open full message history for that conversation
- **Send Message** - Send a new message without Pi suffix
- **Reply** - Open message detail, then press `R` to reply
- **Allow Contact / Allow Group** - Move a recent sender into the appropriate allowed list
- **Remove Alias** - Clear saved alias for that sender
- **Back** - Return to main menu

### WhatsApp Chat Commands
Send these commands directly in WhatsApp to control the agent session:
- **`/compact`** - Compact the current Pi session context
- **`/abort`** - Abort the current Pi agent operation

## Project Structure

```
src/
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

## Notes

- `--whatsapp-pi-online` auto-connects when credentials already exist.
- `--whatsapp-group <jid>` binds Pi to one WhatsApp group.
- Media handling is local: images for vision, audio via Whisper.cpp + ffmpeg, documents stored under `.pi-data/whatsapp/documents/`.
- Recents/history live in `~/.pi/agent/extensions/whatsapp-pi/recents/recents.json`.
- Session state, allow lists, and startup reconnects are persisted locally.
