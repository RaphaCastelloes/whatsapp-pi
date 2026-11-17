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

Every eligible batch item is considered. History/append events and request-ID-bearing resends do not trigger ordinary agent work. A delayed normal `notify` event without a request ID can still trigger work. Replay protection is bounded to 5,000 entries/24 hours, with retained processing outcomes persisted in the selected account archive. Unfinished outcomes become interrupted on restart and are never automatically reissued; eviction ends that protection. There is no durable agent-job replay, and a crash during handoff can lose a request. Retry manually by sending a fresh WhatsApp message, not by automatically resending an uncertain outbound send.

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
| `check_wa_new_messages` | Find conversations whose latest message is incoming, optionally since a timestamp, with an optional local `scope`. |
| `request_wa_history` | Explicitly request up to 100 older messages for an allowed/bound chat, or read retained request status locally. |

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
