# Tasks: Refactor WhatsApp message sending

**Input**: Design documents from `/specs/003-whatsapp-messaging-refactor/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are NOT explicitly requested in the specification; validation will be performed via manual acceptance scenarios as defined in the spec.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Single project structure: `src/` at repository root.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 Initialize messaging models and service files in `src/`
- [x] T002 Verify `@whiskeysockets/baileys` and TypeScript versions in `package.json`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 [P] Define `MessageRequest` and `MessageResult` interfaces in `src/models/whatsapp.types.ts`
- [x] T004 Define `WhatsAppError` class and error types in `src/models/whatsapp.types.ts`
- [x] T005 [P] Add `getStatus()` helper to `WhatsAppService` in `src/services/whatsapp.service.ts` for external status checks

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Reliable Message Sending (Priority: P1) 🎯 MVP

**Goal**: Create a dedicated `MessageSender` that handles retries and connection checks.

**Independent Test**: Trigger a message send using the new service and verify it arrives at the destination while logging retry attempts if forced.

### Implementation for User Story 1

- [x] T006 [P] [US1] Create `src/services/message.sender.ts` with basic class structure
- [x] T007 [US1] Implement `waitIfOffline` mechanism in `MessageSender` in `src/services/message.sender.ts`
- [x] T008 [US1] Implement exponential backoff retry logic in `MessageSender` in `src/services/message.sender.ts`
- [x] T009 [US1] Implement the core `send()` logic integrating with Baileys socket in `src/services/message.sender.ts`
- [x] T010 [US1] Refactor `WhatsAppService.sendMessage` to use the new `MessageSender` in `src/services/whatsapp.service.ts`

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently.

---

## Phase 4: User Story 2 - Response to Incoming Messages (Priority: P2)

**Goal**: Ensure the agent's automated replies use the reliable sending mechanism.

**Independent Test**: Send a message to the agent's number and verify it sends a response back successfully through the refactored method.

### Implementation for User Story 2

- [x] T011 [US2] Update `WhatsAppService.handleIncomingMessages` to utilize the refactored `sendMessage` in `src/services/whatsapp.service.ts`
- [x] T012 [US2] Ensure consistent "π" branding is handled by the refactored sending flow in `src/services/whatsapp.service.ts`

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T013 [P] Add JSDoc documentation to `MessageSender` methods in `src/services/message.sender.ts`
- [x] T014 Conduct manual verification of error logging for invalid numbers and connection drops
- [x] T015 Run `quickstart.md` validation scenarios and update if needed

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Can start immediately.
- **Foundational (Phase 2)**: Depends on Phase 1.
- **User Stories (Phase 3+)**: All depend on Phase 2. US1 is the priority (MVP).
- **Polish (Final Phase)**: Depends on completion of all stories.

### User Story Dependencies

- **User Story 1 (P1)**: Independent of US2.
- **User Story 2 (P2)**: Logically depends on the refactored `sendMessage` from US1 being available.

### Parallel Opportunities

- T003 and T005 can run in parallel.
- T006 (Skeleton) can start in parallel with Foundational work once interfaces are defined.
- Documentation (T013) can run in parallel with final verification.

---

## Parallel Example: Foundational

```bash
# Define interfaces and setup service helpers simultaneously
Task: "Define MessageRequest and MessageResult interfaces in src/models/whatsapp.types.ts"
Task: "Add getStatus() helper to WhatsAppService in src/services/whatsapp.service.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Setup and Foundational phases.
2. Implement `MessageSender` and refactor the primary `sendMessage` method.
3. **STOP and VALIDATE**: Verify that the agent can send messages reliably via manual trigger.

### Incremental Delivery

1. Verify core sending (US1).
2. Integrate with incoming message handling (US2).
3. Final polish and documentation.
