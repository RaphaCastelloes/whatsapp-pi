# Tasks: Baileys Capability Roadmap

**Input**: [spec.md](spec.md), [plan.md](plan.md)
**Status**: Phases 1–2 complete. Phase 2 passed 345 tests in 34 files, lint/typecheck, isolated startup, independent review/re-review, and 11 authorized live sends with operator-confirmed rendering/playback. Phase 3 complete on `feat/baileys-conversation-fidelity`: independent exact-model review/corrections, 397 tests/43 files, lint/typecheck/startup and representative authorized live checks recorded in plan.md. Live backfill import/receipts were not observed; request timeout is explicitly unknown. PR3.md is an ignored local handoff. The original no-publication stop gate completed; the fork owner subsequently authorized commit/push/upstream PR using existing validation evidence.
**Organization**: Exactly three delivery phases. U-IDs link to the detailed approach, file lists, test cases and verification in the plan. Tasks do not authorize commits, dependency upgrades, live-account operations or implementation before approval.

## Phase 1: Foundation — Blocking Prerequisites

**Goal**: Process eligible messages safely, preserve actual identity/full keys, and bind replies to the consumed input rather than the latest arrival.

### U1 — Intake and replay

- [x] T001 Add characterization tests for batched messages, per-item failure, duplicate delivery, append/history/protocol events, operator messages and commands in `tests/unit/whatsapp.service.test.ts`, `tests/unit/incoming-message.resolver.test.ts`, and `tests/unit/whatsapp-pi.extension.test.ts`.
- [x] T002 Normalize each batch item into one typed callback envelope; separate non-prompt events and handle failures without dropping later items in `src/services/whatsapp.service.ts`, `src/models/whatsapp.types.ts`, `src/services/incoming-message.resolver.ts`, and `whatsapp-pi.ts`.
- [x] T003 Add the named bounded replay-ledger states/pre-await reservation, request-ID import-only rule and explicit crash/fresh-message-retry semantics; handle `/abort` and `/compact` before ordinary injection in `src/services/whatsapp.service.ts` and `whatsapp-pi.ts`.

### U2 — Verified identity

- [x] T004 Add PN/LID/device/group/unknown/conflict/account-reset and LID-then-PN/late-mapping re-index scenarios in `tests/unit/jid-resolver.service.test.ts`, `tests/unit/session.manager.test.ts`, `tests/unit/whatsapp.service.test.ts`, and `tests/unit/send-wa-message.tool.test.ts`.
- [x] T005 Add the focused resolver in `src/services/jid-resolver.service.ts`; integrate verified mappings with allowlists, immutable transport keys, display aliases and atomic canonical-index re-keying across the store/ledger/tombstone/pending-update seams in `src/services/whatsapp.service.ts`, `src/services/session.manager.ts`, `src/services/recents.service.ts`, and `src/models/whatsapp.types.ts`.

### U3 — Complete keys and transport

- [x] T006 Cover scoped key lookup, expiry/eviction, incoming/outgoing raw lookup, stable retries, echo races, group read/reaction keys, compound emoji and metadata invalidation in `tests/unit/message-store.service.test.ts`, `tests/unit/message.sender.test.ts`, `tests/unit/reaction.sender.test.ts`, and `tests/unit/whatsapp.service.test.ts`.
- [x] T007 Add bounded in-memory lookup in `src/services/message-store.service.ts`; replace sent-ID-only lookup and preserve full keys through `src/services/whatsapp.service.ts` and `src/models/whatsapp.types.ts`.
- [x] T008 Generalize the existing send orchestration, retain stable outbound IDs/results, and complete receipt/reaction targets in `src/services/message.sender.ts`, `src/services/reaction.sender.ts`, `src/services/whatsapp.service.ts`, and `whatsapp-pi.ts`.

### U4 — Reply provenance

- [x] T034 Before T010, run the explicit U4 compatibility spike using idle/streaming/transition submissions with trigger-turn intent, custom role/queue/input-hook semantics, TUI/RPC image/text display and resume/compaction/recovery fixtures in `tests/unit/whatsapp-pi.extension.test.ts` and `tests/unit/conversation-router.service.test.ts`; record actual resolved Pi package/host versions and go/no-go evidence in this feature's `plan.md`. Stop for approval if the candidate cannot satisfy the contract; do not replace input injection on a failed gate.
- [x] T009 Cover the documented ownership transition table, A/B/terminal interleavings, combined follow-ups, text-plus-tool calls, no-new-input retries, concurrent tools, epoch suppression, commands and reset/reload cleanup in `tests/unit/conversation-router.service.test.ts`, `tests/unit/whatsapp-pi.message-end.test.ts`, `tests/unit/send-wa-message.tool.test.ts`, and `tests/unit/whatsapp-pi.extension.test.ts`.
- [x] T010 After T034 passes, add the provenance state table in `src/services/conversation-router.service.ts`; wire captured destinations, default tools, presence, commands, `message_end` buffering and post-tool `turn_end` mirroring/suppression in `whatsapp-pi.ts`, `src/services/whatsapp.service.ts`, and `src/models/whatsapp.types.ts`.
- [x] T011 Add localized routing/errors in `src/i18n.ts`; document shared-context trust and destination ambiguity in `README.md`.
- [x] T012 Complete the Phase 1 gate from `plan.md`: repository validation, isolated startup, batch/replay/identity/key/routing integration fixtures; record results and update this feature's artifacts.

**Checkpoint**: U1–U4 accepted before any Phase 2 feature work. Shared model context is intentionally preserved; privacy isolation is not claimed.

**Source-review follow-up**: addressed all five findings from the requested `openai-codex/gpt-6.1-sol` read-only review: retry-request key semantics, top-level outgoing group author, asynchronous account/generation fencing, ordinary `π`-ending text, and specification status. Runtime regressions were reproduced before fixing them; see the plan's correction record and final validation evidence.

---

## Phase 2: Everyday usefulness

**Goal**: Deliver explicit document/image sending, native replies, then audio/voice-note/video sending through the same safe transport.

### U5 — Documents and images first

- [x] T013 Add media validation/egress/size, pre-send abort vs post-send delivery-unknown, delayed transport cleanup, routing and result scenarios in `tests/unit/outgoing-media.service.test.ts`, `tests/unit/send-wa-media.tool.test.ts`, `tests/unit/message.sender.test.ts`, and `tests/unit/whatsapp-pi.extension.test.ts`.
- [x] T014 Add local-file validation/preparation in `src/services/outgoing-media.service.ts`; connect media content to `src/services/message.sender.ts`, `src/services/whatsapp.service.ts`, and `src/models/whatsapp.types.ts`.
- [x] T015 Register additive `send_wa_media` document/image support in `whatsapp-pi.ts`; document supported inputs/limits and localize errors in `README.md` and `src/i18n.ts`.

### U6 — Native quoted replies second

- [x] T016 Cover actual quote options, same-chat/full-key lookup, cancel/empty/missing/deleted/expired targets and compatibility in `tests/unit/message-reply.view.test.ts`, `tests/unit/message-detail.view.test.ts`, `tests/unit/send-wa-message.tool.test.ts`, `tests/unit/send-wa-media.tool.test.ts`, and `tests/unit/message.sender.test.ts`.
- [x] T017 Add real stored-message quote targeting through `src/services/message.sender.ts`, `src/services/whatsapp.service.ts`, `src/services/message-store.service.ts`, `src/models/whatsapp.types.ts`, and `whatsapp-pi.ts`.
- [x] T018 Connect the existing reply/detail/menu flow to native quotes and explicit expired/evicted/unsupported quote-availability display in `src/ui/message-reply.view.ts`, `src/ui/message-detail.view.ts`, and `src/ui/menu.handler.ts`; document/localize live-process quote lifetime in `README.md` and `src/i18n.ts`.

### U7 — Audio, voice notes and video third

- [x] T019 Add compatible-input/conversion/MIME/voice-mode, timeout/signal/delayed-child-exit cleanup, post-send unknown outcomes, transport-lifetime ownership, size and shared-send scenarios in `tests/unit/outgoing-media.service.test.ts`, `tests/unit/send-wa-media.tool.test.ts`, and `tests/unit/message.sender.test.ts`.
- [x] T020 Extend existing media preparation/tool choices using installed FFmpeg with signal/timeout/child-exit plumbing and Baileys upload timeout plus truthful in-flight uncertainty in `src/services/outgoing-media.service.ts`, `src/services/message.sender.ts`, `src/models/whatsapp.types.ts`, and `whatsapp-pi.ts`.
- [x] T021 Document supported formats, conversion/upload budgets and no-auto-upload behavior in `README.md`; add corresponding strings in `src/i18n.ts`.
- [x] T022 Complete the Phase 2 gate from `plan.md`: repository validation, isolated startup and every supported media/quote integration path. Request separate approval for live WhatsApp rendering/playback checks and report unrun checks honestly.

**Checkpoint**: U5 → U6 → U7 accepted in that order before Phase 3 migration work. Native quotes are bounded to messages retained by the running process until U8.

---

## Phase 3: Conversation fidelity

**Goal**: Persist faithful bounded records, request available history explicitly, and reconcile lifecycle events without creating new prompts.

### U8 — Durable records and safe migration first

- [x] T023 Add pre-connect profile/account/legacy selection, restart/migration/interruption, safe quote projection/secret exclusion/file permissions, concurrency/atomicity, corruption/degraded state, expiry/admission floors, rollback view limits and local-pagination scenarios in `tests/unit/message-store.service.test.ts`, `tests/unit/message-store.migration.test.ts`, `tests/unit/recents.service.test.ts`, `tests/unit/inbox-read-tools.test.ts`, and `tests/unit/session.manager.test.ts`.
- [x] T024 Extend the existing store with offline profile/account markers, versioned owner-only sanitized JSON/quote projections, atomic writes, expiry/admission-floor/control metadata and interrupted replay outcomes in `src/services/message-store.service.ts`; add helper paths/settings in `src/services/storage-path.ts`, `src/services/session.manager.ts`, and `src/models/whatsapp.types.ts`.
- [x] T025 Import old recents into the read-only unassigned legacy view; make recents projections and add explicit local profile/legacy selection plus startup/shutdown/archive availability in `src/services/recents.service.ts`, `src/services/whatsapp.service.ts`, `src/ui/menu.handler.ts`, and `whatsapp-pi.ts`; cover the menu scope in `tests/unit/menu.handler.test.ts`.
- [x] T026 Document unassigned legacy history, sanitized-secret/quote limits, snapshot rollback's omission of newer records, degraded-state recovery, retention/admission floors, offline account partitioning and cross-process writer limits in `README.md`; localize state/error messages in `src/i18n.ts`.

### U9 — History and explicit backfill second

- [x] T027 Add history/live overlap, authorization, request-ID notify import-only, named Baileys request/session/progress correlation, interrupted reconnect/restart status, missing anchors, timeout/late-account chunks and no-network-read-tool scenarios in `tests/unit/history-sync.service.test.ts`, `tests/unit/request-wa-history.tool.test.ts`, `tests/unit/whatsapp.service.test.ts`, and `tests/unit/inbox-read-tools.test.ts`.
- [x] T028 Add `src/services/history-sync.service.ts`; wire typed history events, allowed/bound filtering, verified mappings and explicit sync settings in `src/services/whatsapp.service.ts`, `src/services/session.manager.ts`, `src/services/message-store.service.ts`, `src/services/recents.service.ts`, and `src/models/whatsapp.types.ts`.
- [x] T029 Add `request_wa_history` request/local-status modes in `whatsapp-pi.ts`; document/localize asynchronous bounded history and availability limits in `README.md` and `src/i18n.ts`.

### U10 — Lifecycle reconciliation third

- [x] T030 Add receipt/group scope, edit/delete-before-base, remote/local/chat-wide deletion and late reimport after tombstone eviction, admission-floor pressure, bounded convergence/incomplete knowledge, reaction merging, restart and no-prompt scenarios in `tests/unit/whatsapp.service.lifecycle.test.ts`, `tests/unit/message-store.service.test.ts`, `tests/unit/incoming-message.resolver.test.ts`, `tests/unit/message-detail.view.test.ts`, and `tests/unit/inbox-read-tools.test.ts`.
- [x] T031 Wire lifecycle events and reconcile bounded pending updates/tombstones in `src/services/whatsapp.service.ts`, `src/services/message-store.service.ts`, `src/services/incoming-message.resolver.ts`, and `src/models/whatsapp.types.ts`.
- [x] T032 Surface authoritative status/edit/delete/reaction information through `src/services/recents.service.ts`, `src/ui/message-detail.view.ts`, and `whatsapp-pi.ts`; update `README.md` and `src/i18n.ts` without introducing outbound destructive-action tools.
- [x] T033 Complete the Phase 3 gate from `plan.md`: repository validation, isolated startup, migration/rollback and out-of-order event integration coverage; separately approve any live-account history/receipt checks and record exact evidence.

**Checkpoint**: U8 → U9 → U10 accepted in order. Existing read tools remain local-only, histories do not prompt the agent, and delivery/read claims require observed evidence.

---

## Dependencies & Execution Rules

- Phase 1 blocks Phase 2; Phase 2 blocks Phase 3. See the plan's dependency diagram and per-unit dependencies.
- U1–U10 are delivery units; T001–T034 are 34 actionable implementation/verification tasks. T034 was added by review and intentionally appears before T009/T010 as U4's go/no-go prerequisite; existing IDs are not renumbered.
- No parallel implementation lanes are marked: several units touch the same entrypoint, model and socket services. Small test-only/documentation edits may be parallelized only after confirming nonoverlapping scope.
- Follow the owner's class/service boundaries, strict TypeScript, `.js` source imports, four-space service formatting, TypeBox/i18n registration and Vitest mock/fake-timer conventions.
- Each feature-bearing task's detailed acceptance/error/integration cases live under its U-ID in `plan.md`; do not mark it complete based only on a happy-path test.
- All checks against WhatsApp, publication, dependencies, credentials or shared storage need the separate approvals described in the plan. Never mutate a real user's auth or recents in tests.

<!-- Phase 4: Optional expansion — deliberately not a task phase.
Potential API additions are recorded only in spec.md and plan.md comments.
No implementation tasks, dependencies or delivery commitments are assigned here.
-->
