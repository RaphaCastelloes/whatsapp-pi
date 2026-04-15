# Tasks: Send WhatsApp Message Tool (JID + Text)

**Input**: Design documents from `/specs/013-send-wa-message/`
**Prerequisites**: plan.md ✅ spec.md ✅ research.md ✅ data-model.md ✅ contracts/ ✅

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the TypeBox import and confirm the Pi SDK tool registration API is available — the only setup needed before any story work begins.

- [x] T001 Add `Type` import from `@sinclair/typebox` at the top of `whatsapp-pi.ts` (line 1 imports block)

**Checkpoint**: `whatsapp-pi.ts` compiles cleanly with the new import (`npm run typecheck`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: No new foundational infrastructure is needed. The existing `WhatsAppService`, `MessageSender`, `RecentsService`, and `SessionManager` already provide everything required. The connection guard pattern (checking `getStatus()`) is the only shared logic and is simple enough to write inline in the tool's `execute` function.

**⚠️ NOTE**: Phase 2 is intentionally empty for this feature — no blocking prerequisites exist beyond T001.

---

## Phase 3: User Story 1 — Pi Proactively Sends a WhatsApp Message (Priority: P1) 🎯 MVP

**Goal**: Register `send_wa_message` as an LLM-callable Pi tool that delivers a message to a given JID using the existing send pipeline and returns a structured JSON result.

**Independent Test**: With Pi connected to WhatsApp, ask Pi to call `send_wa_message` with a valid JID and message. Verify the message arrives on the target device and Pi receives `{ "success": true, "messageId": "..." }`.

### Implementation for User Story 1

- [x] T002 [US1] Register `pi.registerTool` block for `send_wa_message` in `whatsapp-pi.ts` after the `registerCommand("whatsapp", ...)` block — include `name`, `label`, `description`, `parameters` (TypeBox schema with `jid` and `message` string fields, `minLength: 1` each), and a stub `execute` that returns `{ isError: true, content: [{ type: "text", text: '{"success":false,"error":"not implemented","attempts":0}' }] }`
- [x] T003 [US1] Implement the connection guard in the `execute` function in `whatsapp-pi.ts`: if `whatsappService.getStatus() !== 'connected'` return immediately with `{ isError: true, content: [{ type: "text", text: JSON.stringify({ success: false, error: "WhatsApp not connected", attempts: 0 }) }] }`
- [x] T004 [US1] Implement message delivery in the `execute` function in `whatsapp-pi.ts`: call `await whatsappService.sendMessage(params.jid, params.message)` and capture the `MessageResult`
- [x] T005 [US1] Implement result serialisation in the `execute` function in `whatsapp-pi.ts`: return `{ isError: !result.success, content: [{ type: "text", text: JSON.stringify({ success: result.success, messageId: result.messageId, error: result.error, attempts: result.attempts }) }] }`

**Checkpoint**: Pi can call `send_wa_message` and a WhatsApp message is delivered to the target contact. Success and failure results are returned as structured JSON.

---

## Phase 4: User Story 2 — Tool Returns Structured Feedback (Priority: P2)

**Goal**: Ensure the structured result contract is complete and accurate — `success`, `messageId` (on success), `error` (on failure), and `attempts` are always present and correctly typed in the JSON returned to Pi.

**Independent Test**: Trigger a failure by calling the tool while WhatsApp is disconnected (or by mocking `sendMessage` to return `{ success: false, error: "...", attempts: 2 }`). Confirm `isError: true` and a parseable JSON string with `success: false` and a non-empty `error` field are returned.

### Implementation for User Story 2

- [x] T006 [US2] Add unit test file `tests/unit/send-wa-message.tool.test.ts` with test cases for: (a) not-connected guard returns `{ success: false, error: "WhatsApp not connected", attempts: 0 }` with `isError: true`; (b) successful delivery returns `{ success: true, messageId: <id>, attempts: 1 }` with `isError: false`; (c) failed delivery returns `{ success: false, error: <msg>, attempts: <n> }` with `isError: true`
- [x] T007 [P] [US2] Run `npm test` to confirm all three unit test cases pass against the Phase 3 implementation

**Checkpoint**: `npm test` passes. All three result shapes are verified by automated tests.

---

## Phase 5: User Story 3 — Outgoing Message Recorded in Recents (Priority: P3)

**Goal**: After a successful send via `send_wa_message`, the message is stored in the recents store as an outgoing entry so that conversation history is complete regardless of how the message was initiated.

**Independent Test**: After calling `send_wa_message` successfully, query the recents store for the target JID's conversation. Verify an outgoing entry exists with the correct `senderNumber`, `text`, `direction: 'outgoing'`, and a recent `timestamp`.

### Implementation for User Story 3

- [x] T008 [US3] In the `execute` function in `whatsapp-pi.ts`, after a successful send (`result.success === true`), call `recentsService.recordMessage({ messageId: result.messageId!, senderNumber: '+' + params.jid.split('@')[0], text: params.message, direction: 'outgoing', timestamp: Date.now() })` — mirror the identical pattern used in the `message_end` event handler
- [x] T009 [US3] Add a unit test case to `tests/unit/send-wa-message.tool.test.ts` verifying that `recentsService.recordMessage` is called with the correct arguments on success and is NOT called on failure or when disconnected
- [x] T010 [P] [US3] Run `npm test` to confirm all unit test cases pass including the new recents recording test

**Checkpoint**: All user stories independently functional. `npm test` passes. Recents store contains outgoing entries for messages sent via the tool.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and optional improvements.

- [x] T011 [P] Run `npm run typecheck` on `whatsapp-pi.ts` to confirm no TypeScript errors are introduced by the new `registerTool` block and `Type` import
- [x] T012 Add `promptSnippet` to the tool definition in `whatsapp-pi.ts` so the tool appears in Pi's "Available tools" system prompt section: `"send_wa_message(jid, message) - Send a WhatsApp message to a contact by JID"`
- [ ] T013 [P] Verify `send_wa_message` appears in Pi's tool list at runtime by checking `pi.getAllTools()` output or observing tool availability in a live Pi session

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Empty for this feature
- **US1 (Phase 3)**: Depends on T001 (Setup) — BLOCKS US2 and US3
- **US2 (Phase 4)**: Depends on US1 being complete (tests validate Phase 3 implementation)
- **US3 (Phase 5)**: Depends on US1 being complete; US2 and US3 can run in parallel after US1
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Can start after T001 — no dependency on other stories
- **US2 (P2)**: Depends on US1 implementation (tests validate it) — no new production code needed
- **US3 (P3)**: Depends on US1 implementation — can run in parallel with US2 after US1 completes

### Within Each User Story

- T002 → T003 → T004 → T005 (sequential — each task builds on the previous stub)
- T006 and T007 are sequential (write tests, then run them)
- T008 → T009 → T010 (sequential within US3)

### Parallel Opportunities

- T007 (run tests) and T008 (recents recording implementation) can run in parallel after US1 is complete — they touch different parts: T007 validates existing code while T008 extends `execute`
- T011 and T013 in the polish phase can both run in parallel
- T009 and T010 can begin as soon as T008 is committed

---

## Parallel Example: After US1 Complete

```
# These can run in parallel:
Task T006: "Add unit tests for result shapes in tests/unit/send-wa-message.tool.test.ts"
Task T008: "Add recents recording call in whatsapp-pi.ts execute function"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: T001 (import)
2. Complete Phase 3: T002 → T003 → T004 → T005 (register + implement tool)
3. **STOP and VALIDATE**: Ask Pi to call `send_wa_message` with a real JID — confirm delivery
4. Merge / demo if ready

### Incremental Delivery

1. Phase 1 + Phase 3 → Tool registered and delivering messages (MVP)
2. Phase 4 (US2) → Unit tests confirm structured result contract
3. Phase 5 (US3) → Recents store updated on every tool-initiated send
4. Phase 6 → Polish (`promptSnippet`, typecheck)

---

## Notes

- [P] tasks = different files or no shared state, safe to parallelize
- The tool registration (`registerTool`) must be inside the `export default function(pi)` factory in `whatsapp-pi.ts` — access to `whatsappService` and `recentsService` is via closure
- The `Type` import is from `@sinclair/typebox` — it is already a transitive dependency, no `package.json` change needed
- The π branding suffix is applied internally by `MessageSender.send()` — do NOT add it manually in the tool
- `lastRemoteJid` is intentionally NOT updated by this tool — only inbound messages set the reply target
