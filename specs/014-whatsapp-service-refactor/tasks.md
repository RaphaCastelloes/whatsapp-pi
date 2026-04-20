# Tasks: WhatsApp Service Refactor

**Input**: Design documents from `/specs/014-whatsapp-service-refactor/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/ (not used for this feature)

**Tests**: Explicit new test tasks were not requested. Existing unit tests will be updated as part of the maintenance story to protect behavior.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare the refactor work by capturing the current service boundaries and baseline behavior

- [x] T001 Review `src/services/whatsapp.service.ts` and related service files to map the current responsibilities, status transitions, and message flow boundaries
- [x] T002 Inspect `tests/unit/whatsapp.service.test.ts`, `tests/unit/whatsapp.service.auth-failure.test.ts`, and `tests/unit/whatsapp.service.console-filter.test.ts` to identify the behavior that must remain unchanged

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish the internal structure needed before any user-story-specific refactor work can be completed

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Create narrow internal event and message shape definitions in `src/services/whatsapp.service.ts` for connection updates and incoming message handling
- [x] T004 Refactor `src/services/whatsapp.service.ts` to isolate socket creation, cleanup, and listener registration into focused private helpers
- [x] T005 Refactor `src/services/whatsapp.service.ts` to centralize connection state checks and avoid duplicate active sessions during reconnect or shutdown paths

**Checkpoint**: The service structure is ready for story-specific refactoring without changing the public API

---

## Phase 3: User Story 1 - Maintainable WhatsApp Service (Priority: P1) 🎯 MVP

**Goal**: Make `src/services/whatsapp.service.ts` easier to understand and change by separating its core responsibilities

**Independent Test**: The service still sends, receives, and reports status exactly as before, while the code path for each responsibility is clearly separated in `src/services/whatsapp.service.ts`

### Implementation for User Story 1

- [x] T006 [US1] Refactor `start()` in `src/services/whatsapp.service.ts` to delegate socket setup, auth loading, and event wiring to smaller helper methods
- [x] T007 [P] [US1] Refactor `handleIncomingMessages()` in `src/services/whatsapp.service.ts` to isolate message normalization, ignore rules, recording, and callback dispatch
- [x] T008 [US1] Refactor `sendMessage()`, `sendMenuMessage()`, `sendPresence()`, and `markRead()` in `src/services/whatsapp.service.ts` to share a consistent connected-state guard
- [x] T009 [P] [US1] Replace remaining unsafe `any` usage in the refactored paths of `src/services/whatsapp.service.ts` with narrower internal types or interfaces

**Checkpoint**: User Story 1 is complete when the service responsibilities are separated and the existing outward behavior is preserved

---

## Phase 4: User Story 2 - Safer Connection Recovery (Priority: P2)

**Goal**: Make connection loss, session rejection, and reconnection behavior more predictable and easier to reason about

**Independent Test**: Simulate connection close, logged-out, conflict, and auth-rejection scenarios and confirm the service reports the same user-facing states as before

### Implementation for User Story 2

- [x] T010 [US2] Refactor the connection close handler in `src/services/whatsapp.service.ts` to classify reconnect, logged-out, bad MAC, auth-rejected, and conflict outcomes in one place
- [x] T011 [P] [US2] Simplify the reconnect and re-pair flow in `src/services/whatsapp.service.ts` so only one recovery path can be active at a time
- [x] T012 [US2] Preserve the existing status and callback messages in `src/services/whatsapp.service.ts` for reconnecting, connected, disconnected, logged-out, conflict, and session error states

**Checkpoint**: User Story 2 is complete when recovery behavior is predictable and externally unchanged

---

## Phase 5: User Story 3 - Easier Ongoing Maintenance (Priority: P3)

**Goal**: Improve confidence in future changes by tightening the regression coverage around the refactored service

**Independent Test**: Run the existing WhatsApp service unit tests and confirm the refactor still passes the expected behavior checks without requiring manual inspection of internals

### Implementation for User Story 3

- [x] T013 [P] [US3] Update `tests/unit/whatsapp.service.test.ts` to confirm allow/block filtering, effective status, and incoming message routing still behave correctly after the refactor
- [x] T014 [P] [US3] Update `tests/unit/whatsapp.service.auth-failure.test.ts` to confirm rejected auth state handling and fallback pairing still work after the refactor
- [x] T015 [P] [US3] Update `tests/unit/whatsapp.service.console-filter.test.ts` to confirm quiet and verbose logging behavior still matches the expected service output
- [x] T016 [US3] Refine method names and inline comments in `src/services/whatsapp.service.ts` so each responsibility is obvious to future maintainers

**Checkpoint**: User Story 3 is complete when the service is easier to maintain and the behavior is protected by updated tests

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final verification and cleanup across the refactor

- [x] T017 [P] Run `npm test` and `npm run typecheck`, then fix any regressions in `src/services/whatsapp.service.ts` or the updated unit tests
- [x] T018 [P] Confirm the quickstart steps in `specs/014-whatsapp-service-refactor/quickstart.md` still match the final validation flow and update them if needed

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion and blocks all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational completion
- **User Story 2 (Phase 4)**: Depends on Foundational completion; can proceed after or alongside US1 once the shared structure is ready
- **User Story 3 (Phase 5)**: Depends on the refactor being in place so the tests reflect the final service behavior
- **Polish (Phase 6)**: Depends on the story work being complete

### User Story Dependencies

- **User Story 1 (P1)**: No dependency on other stories; this is the MVP refactor slice
- **User Story 2 (P2)**: Depends on the shared foundation from Phase 2, but remains independently testable
- **User Story 3 (P3)**: Depends on the refactored behavior stabilizing so the regression tests represent the final shape

### Within Each User Story

- Complete the core refactor tasks before polishing the same story
- Keep story-specific work inside `src/services/whatsapp.service.ts` or the matching unit test files
- Validate each story independently before moving to the next priority

### Parallel Opportunities

- T007 and T009 can run in parallel because they touch different concerns inside the same refactor scope and do not depend on each other directly
- T011 can run after T010 and independently from T012 once the connection classification structure exists
- T013, T014, and T015 can run in parallel because they update separate test files
- T017 and T018 can run in parallel because one validates code and the other validates documentation

---

## Parallel Example: User Story 1

```bash
Task: "Refactor handleIncomingMessages() in src/services/whatsapp.service.ts to isolate message normalization, ignore rules, recording, and callback dispatch"
Task: "Replace remaining unsafe any usage in the refactored paths of src/services/whatsapp.service.ts with narrower internal types or interfaces"
```

## Parallel Example: User Story 3

```bash
Task: "Update tests/unit/whatsapp.service.test.ts to confirm allow/block filtering, effective status, and incoming message routing still behave correctly after the refactor"
Task: "Update tests/unit/whatsapp.service.auth-failure.test.ts to confirm rejected auth state handling and fallback pairing still work after the refactor"
Task: "Update tests/unit/whatsapp.service.console-filter.test.ts to confirm quiet and verbose logging behavior still matches the expected service output"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. Stop and validate that the service still behaves the same from the caller's perspective

### Incremental Delivery

1. Deliver the service refactor foundation first
2. Complete User Story 1 to separate the service responsibilities
3. Complete User Story 2 to make recovery behavior clearer and safer
4. Complete User Story 3 to lock in regression coverage and maintainability
5. Finish with polish and validation

### Parallel Team Strategy

1. One developer can handle the core service refactor in `src/services/whatsapp.service.ts`
2. Another developer can update the independent unit tests in `tests/unit/`
3. A third developer can verify quickstart and final validation steps in `specs/014-whatsapp-service-refactor/quickstart.md`

---

## Task Summary

- **Total tasks**: 18
- **User Story 1**: 4 tasks
- **User Story 2**: 3 tasks
- **User Story 3**: 4 tasks
- **Setup + Foundational + Polish**: 7 tasks
- **Parallel opportunities identified**: 5
- **Suggested MVP scope**: User Story 1 only
- **Format validation**: All tasks follow the required checkbox + ID + optional parallel marker + story label + file path format
