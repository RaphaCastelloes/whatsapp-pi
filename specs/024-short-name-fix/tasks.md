# Tasks: Menu Message Send Reliability

**Input**: Design documents from `/specs/024-short-name-fix/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare shared contracts and verification notes for the outgoing send flow.

- [X] T001 [P] Update `src/models/whatsapp.types.ts` to keep a single shared outgoing-send result/option contract for all send entry points.
- [X] T002 [P] Align `specs/024-short-name-fix/quickstart.md` with the intended end-to-end verification flow for menu, reply, and recents sending.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Create the shared send pipeline that all user-facing entry points will reuse.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T003 Refactor `src/services/message.sender.ts` to expose a shared send orchestration path reusable by other send entry points.
- [X] T004 Refactor `src/services/whatsapp.service.ts` to centralize outgoing presence, retry, and error handling around the shared send orchestration.

**Checkpoint**: Shared send behavior exists and can be reused by menu, reply, and recents flows.

---

## Phase 3: User Story 1 - Reliable menu send (Priority: P1) 🎯 MVP

**Goal**: Menu-based message sending becomes dependable and returns a clear final outcome.

**Independent Test**: Open the WhatsApp menu, send a message, and confirm the user gets a clear success or failure result even if the connection is unstable.

### Implementation for User Story 1

- [X] T005 [US1] Route `sendMenuMessage()` in `src/services/whatsapp.service.ts` through the shared send orchestration instead of direct socket sending.
- [X] T006 [P] [US1] Simplify menu action handling in `src/ui/menu.handler.ts` so menu sends rely on the service result and do not duplicate retry or recovery logic.
- [X] T007 [US1] Verify successful menu sends continue to persist conversation history in `whatsapp-pi.ts` using the unified result shape.

**Checkpoint**: Menu send flow works as a standalone, testable increment.

---

## Phase 4: User Story 2 - Distinguish Agent and menu origin (Priority: P2)

**Goal**: Agent-originated responses include the π marker, while menu-originated responses do not.

**Independent Test**: Send one response from the Agent path and one from the menu path, then confirm only the Agent response includes π.

### Implementation for User Story 2

- [X] T008 [P] [US2] Update `src/ui/message-reply.view.ts` to use the shared send behavior and ensure it does not add the π marker.
- [X] T009 [P] [US2] Normalize menu-based send handling in `src/ui/menu.handler.ts` so it does not add the π marker.
- [X] T010 [US2] Centralize the origin-aware π marker policy in `src/services/message.sender.ts` and apply it only to Agent-originated responses.

**Checkpoint**: Agent and menu marker rules are now intentionally different and documented.

---

## Phase 5: User Story 3 - Clear message format and feedback (Priority: P3)

**Goal**: Empty messages are blocked and the user receives clear send feedback.

**Independent Test**: Try blank text, valid text, and a failed send, then confirm the system blocks invalid input and shows a clear outcome.

### Implementation for User Story 3

- [X] T011 [P] [US3] Add blank-message validation before send in `src/ui/message-reply.view.ts`.
- [X] T012 [P] [US3] Add blank-message validation before send in `src/ui/menu.handler.ts`.
- [X] T013 [US3] Standardize user-facing send result messages in `src/ui/message-reply.view.ts` and `src/ui/menu.handler.ts` for success and failure cases.

**Checkpoint**: Invalid input is blocked and send feedback is consistent.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Clean up shared behavior and align docs with the final implementation.

- [X] T014 [P] Update `specs/024-short-name-fix/quickstart.md` to reflect final manual verification for menu, reply, and recents sends.
- [X] T015 Clean up duplicated comments and unreachable send branches in `src/services/whatsapp.service.ts`, `src/ui/menu.handler.ts`, and `src/ui/message-reply.view.ts`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies.
- **Phase 2 (Foundational)**: Depends on Phase 1 completion; blocks all user stories.
- **Phase 3 (US1)**: Depends on Phase 2 completion.
- **Phase 4 (US2)**: Depends on Phase 2 completion; can follow US1 or run after shared pipeline stabilizes.
- **Phase 5 (US3)**: Depends on Phase 2 completion; can run after the shared pipeline exists.
- **Phase 6 (Polish)**: Depends on desired user stories being complete.

### User Story Dependencies

- **US1**: No dependency on US2/US3; MVP target.
- **US2**: Depends on the shared send pipeline but not on UI polish.
- **US3**: Depends on shared send pipeline and consistent UI entry points.

### Within Each User Story

- Shared service changes first.
- UI changes after service behavior is stable.
- Cleanup after behavior is verified.

## Parallel Execution Examples

### User Story 1

```bash
Task: "T006 [P] [US1] Simplify menu action handling in src/ui/menu.handler.ts so menu sends rely on the service result and do not duplicate retry or recovery logic."
Task: "T007 [US1] Verify successful menu sends continue to persist conversation history in whatsapp-pi.ts using the unified result shape."
```

### User Story 2

```bash
Task: "T008 [P] [US2] Update src/ui/message-reply.view.ts to use the shared send behavior and ensure it does not add the π marker."
Task: "T009 [P] [US2] Normalize menu-based send handling in src/ui/menu.handler.ts so it does not add the π marker."
```

### User Story 3

```bash
Task: "T011 [P] [US3] Add blank-message validation before send in src/ui/message-reply.view.ts."
Task: "T012 [P] [US3] Add blank-message validation before send in src/ui/menu.handler.ts."
```

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2.
2. Deliver US1 first.
3. Validate menu sending reliability independently.
4. Stop and demo if menu sending is stable.

### Incremental Delivery

1. Foundation: shared send path.
2. US1: reliable menu send.
3. US2: origin-aware π marker for Agent vs menu responses.
4. US3: clear validation and feedback.
5. Polish: cleanup and documentation sync.

## Validation

- All tasks follow checklist format: yes.
- All user stories have independent task groups: yes.
- MVP scope is User Story 1: yes.
