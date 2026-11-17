# Feature Specification: Baileys Capability Roadmap

**Feature**: `036-baileys-capability-roadmap`
**Created**: 2026-10-21
**Status**: Phases 1–2 implemented and validated; Phase 2 independent review fixes verified, 345 tests passed and authorized live rendering/playback confirmed by the operator. Phase 3 (U8–U10) is implemented on `feat/baileys-conversation-fidelity`, independently reviewed/corrected and validated with 397 passing tests plus authorized restart/native-quote live checks. Live backfill import and delivery/read receipts remain unverified: the bounded request reached unknown timeout and no receipt events were observed. After the implementation stop gate, the fork owner separately authorized commit/push/upstream PR, without implying upstream maintainer approval.
**Input**: Implement the analyzed Baileys gaps in three ordered phases: Foundation, Everyday usefulness, Conversation fidelity. Preserve the owner's architecture and programming style. Optional expansion remains a comment, not scheduled work.

## Decisions Confirmed by the User

- The fork owner authorized Phase 3 implementation, followed by an independent read-only `openai-codex/gpt-6.1-sol` review, all declared checks and live tests only with the designated recipient. The original execution finished with ignored `PR3.md` and stopped without publication. The fork owner then separately authorized commit, push and an upstream PR, using existing validation evidence. Real rollback and production-data migration remain outside that authorization.
- Planning artifacts follow the repository's numbered `specs/` convention.
- Different allowed chats continue to share one Pi model context. This is a trusted-user integration, not a multi-tenant service. Correct destination routing does not provide context isolation.
- The fork owner subsequently authorized Phase 2 implementation, an independent `openai-codex/gpt-6.1-sol` review, and live sends to an explicitly designated test recipient. A separate Phase 2 branch preserves the existing Phase 1 upstream PR. This is not approval of Phase 3 or publication of the new work.
- The original request authorized planning and review. The user subsequently authorized Phase 1 (U1–U4) implementation; the separate later Phase 2 approval is recorded above. Phase 3 was authorized separately in the current execution.
- The user approved the bounded replay/storage/cancellation corrections from the planning review. The custom-message lifecycle candidate then failed input-policy characterization, and the user approved preserving `sendUserMessage` with an exact-content-correlated sidecar. That replacement passed the recorded offline compatibility checks.
- A subsequent read-only source review with `openai-codex/gpt-6.1-sol` identified three blocking correctness issues and two actionable notes. Corrections and regression evidence are recorded in [plan.md](plan.md). These are local fork decisions, not upstream maintainer approval.

## User Scenarios & Testing

### User Story 1 — Predictable Message Handling (Phase 1: Foundation)

As an operator, I want all eligible incoming messages handled once within the supported replay window, using real WhatsApp identities and complete message keys, without replying to the wrong conversation.

**Independent test**: Deliver a batch containing messages from two allowed chats, re-deliver the batch, then deliver history and a terminal prompt. Observe destination-safe responses without history-driven prompts or duplicate live processing.

**Acceptance scenarios**:

1. A batch containing two eligible messages processes both in arrival order; malformed or unauthorized items do not discard later items.
2. Repeated live events do not repeat agent work within the bounded replay window. History/append events and all `requestId`-bearing resends update records without triggering the agent. An ordinary delayed/offline `notify` without a request ID retains existing eligibility; age alone is not a live/history classifier.
3. A phone-number allowlist entry matches its verified LID mapping; unresolved/conflicting identities never bypass authorization. LID/PN variants index the same scoped message, and late mappings atomically re-index earlier records, replay state and deletion protection without modifying original transport keys.
4. A new message from chat B during chat A's response cannot redirect A's response, typing indicators, quoted reply, or default-destination tools to B.
5. A response without unique, current provenance is not automatically mirrored. Terminal-only turns never reuse an old destination. Automatic mirroring waits until tool results at `turn_end`; text-plus-tool output cannot mirror first and duplicate a later send. The implemented sidecar preserves ordinary user-input injection; replacing that transport still requires a new compatibility gate.
6. Group read receipts and reactions preserve participant, direction, and relevant alternate identities, including the top-level author returned on outgoing group messages. Outgoing retry receipt participants are requester metadata, not original-author lookup hints. Extension-generated echoes do not become new prompts; ordinary incoming text ending in `π` remains eligible.
7. Failed sends report failure/uncertainty without claiming recipient delivery. Retries retain one logical message identity. Fire-and-forget Pi submission is only handed-off until input consumption is observed; retained unfinished/failed ledger entries are not auto-replayed after a crash. An operator retry means sending a fresh message/new ID; original agent work can be lost across a crash.
8. A batch and its asynchronous preparation retain their admitted account/auth scope and session generation. Account changes, logout or explicit stop invalidate unfinished work, including late mappings and command acknowledgements. Same-account transport reconnects preserve admitted batch work but cannot apply lookup results or callbacks from obsolete sockets.

### User Story 2 — Share Useful Artifacts (Phase 2: Everyday usefulness)

As an operator or agent, I want to send documents and images, reply with a native WhatsApp quote, and then send audio, voice notes, and video through the existing connection.

**Independent test**: Send a local PDF/image to an explicit contact/group, quote a selected incoming message, then send compatible audio/video. Verify native rendering on an approved test account.

**Acceptance scenarios**:

1. Existing text tools and menu text sending remain compatible. A separate media tool sends a local file with explicit media type, optional caption, and the same destination resolution as text.
2. Missing, unreadable, empty, oversized, unsupported, or prohibited files fail before upload. URLs and model-authored paths in ordinary responses are not automatically fetched or uploaded.
3. The reply UI and optional quote parameters on text/media tools target the actual selected message in the same conversation. A missing, deleted, expired, or ambiguous target produces a clear error instead of an unquoted send.
4. Phase 2 quotes work for messages available in the running process's bounded message store. Phase 3 extends availability across restarts; the UI does not imply otherwise.
5. Audio files and voice notes are distinct modes; existing FFmpeg handles required conversion with explicit signal/timeout/child-exit handling. Abort before Baileys send prevents transmission; after it starts, this API cannot guarantee cancellation, so record delivery-unknown and do not blindly retry. Retain temporary-file ownership until subprocess/transport use ends, then clean up. Unknown outcomes are not success records.
6. Documents/images ship before audio/video. GIFs, stickers, and albums are not included in these phases.

### User Story 3 — Trust the Local Conversation Record (Phase 3: Conversation fidelity)

As an operator, I want local records to survive restart, preserve content and message identity, import available history without prompting the agent, and reflect lifecycle updates accurately.

**Independent test**: Upgrade from an existing recents file; persist text, media metadata, and complete keys; restart; request bounded history; apply out-of-order receipt/edit/delete/reaction events; inspect the resulting history.

**Acceptance scenarios**:

1. Disconnected reads use persisted storage-profile/last-verified account markers, without needing a socket. Unattributable legacy global recents remain a read-only unassigned view, not silently attached to the next login; missing historical identities/content are not invented. Newly stored emoji/newlines remain intact.
2. Local records distinguish socket send acceptance from delivery/read/playback receipts. Group receipts remain per participant; no false group-wide read claim is made.
3. Incoming lifecycle events reconcile idempotently, including before-base delivery, while required updates remain within the documented retained bounds. Eviction can leave explicit incomplete knowledge; no unlimited convergence claim is made. Remote/local deletion protection advances historical-admission floors before tombstones are evicted, preventing covered content from reappearing through later ingestion. These events never create ordinary agent prompts.
4. History sync and explicit bounded backfill import only allowed/bound conversations under the configured policy, deduplicate live overlaps, preserve direction and time units, and never automatically download historical attachments or run transcription/PDF extraction.
5. Existing read-only inbox tools remain local-only, with their existing default result limits. Pagination is additive; explicit history requests are a separate network operation with pending/partial/complete/failed state.
6. Missing/unreadable/corrupt/future-version storage produces a recoverable state without overwriting originals. Migration is restart-safe. Rolling back to the old recents snapshot omits newer messages in the old code's view; the new archive remains untouched for recovery/re-upgrade. Real rollback requires operator acknowledgement of that limitation.
7. View-once content is excluded from the new store. Persistent quotes use a minimal observed-content projection without media keys/download URLs/raw context secrets; archive files/backups are owner-only. Raw retry envelopes stay memory-only within 500 messages/24 hours; supported safe projections can remain quotable longer, unsupported types report unavailability. Protocol expiry is earlier than archive age limits. These rules do not erase preexisting Pi transcripts/logs/downloaded files.
8. History requests name actual Baileys correlation fields, remain pending/partial/unknown when not correlated, and become interrupted on disconnect/restart without automatic reissue. Late authorized chunks import only within account and admission boundaries.

## Requirements

| ID | Requirement | Delivery |
|---|---|---|
| R1 | Normalize every item in an upsert batch; separate live events, history, protocol updates, and extension echoes; suppress duplicate live work within a defined window. | Phase 1, extended Phase 3 |
| R2 | Resolve verified PN/LID aliases without manufacturing phone numbers; preserve original transport keys and fail closed for ambiguous identity. | Phase 1 |
| R3 | Bind automatic sends and default tool destinations to consumed request provenance, not the latest incoming chat; retain explicitly shared model context. | Phase 1 |
| R4 | Preserve full keys for lookup, receipts, reactions, retries, and future quotes; use stable outbound IDs and truthful send results. | Phase 1 |
| R5 | Send validated local documents/images, with compatible text behavior and no implicit upload. | Phase 2, first |
| R6 | Support native quoted text/media replies from tools and the existing reply UI; reject unavailable or cross-chat targets. | Phase 2, second |
| R7 | Send audio, voice notes and video with bounded conversion/upload, pre-send abort prevention and truthful post-send uncertainty using existing dependencies. | Phase 2, third |
| R8 | Persist bounded versioned normalized records and secret-free quote projections; select account profiles offline, preserve unassigned legacy history, and document migration/rollback/expiry limits. | Phase 3, first |
| R9 | Import permitted linked-device history and expose explicit bounded backfill without prompts or automatic media work. | Phase 3, second |
| R10 | Reconcile lifecycle updates within retained bounds, preserve deletion admission floors, and avoid false delivery claims or duplicated records. | Phase 3, third |
| R11 | Preserve public compatibility, localization, allowlists/group binding, session cleanup, owner conventions, and documented trust/retention limits. | All phases |

## Scope Boundaries

- No independent agent session per chat; no claim that chat contexts are private from one another.
- No new package, database, framework, generic event bus, background worker, or dependency upgrade without approval.
- No exactly-once delivery guarantee, durable outbound job queue, or automatic crash replay of agent work.
- No unlimited WhatsApp history/search guarantee. History availability is limited by WhatsApp/Baileys and local retention.
- No outbound edit/delete/forward/pin tools in Phase 3: lifecycle fidelity here means receiving and reconciling those events, not exposing new destructive actions.
- Existing authentication files and session credentials are outside the new message-store migration.
- No changes to global Pi configuration, automatic WhatsApp connection, publication, or git history as part of planning.

## Success Criteria

- SC1: Batch, replay, identity, group-key, routing, and terminal-interleaving regression tests pass before Phase 2 starts.
- SC2: Text/document/image/native-quote/audio/voice-note/video paths each have positive, boundary, failure, cancellation, and cross-layer coverage.
- SC3: Storage restart/migration/corruption/concurrency tests pass; histories preserve new content and never trigger the agent.
- SC4: Out-of-order updates converge while required events remain within the stated count/time retention bounds; beyond those bounds, incomplete state is explicit. Tombstone eviction first persists an admission floor so covered deleted content does not reappear.
- SC5: Every phase satisfies repository lint, typecheck, unit tests, an isolated extension startup smoke test, and its targeted integration fixtures. Live-account checks are separately approved and reported honestly.

<!-- Phase 4: Optional expansion — not scheduled or authorized by this plan.
Potential later work: mentions; polls/vote aggregation; outbound edit/delete/forward/pin;
stickers/GIFs/albums; contact/group discovery and administration; chat/account/privacy
controls; pairing codes; communities/channels/status/business APIs; call notifications,
rejection, and call links. Select concrete use cases before planning any of these.
-->
