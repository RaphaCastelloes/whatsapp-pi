---

description: "Task list for QR Code Display feature implementation"
---

# Tasks: QR Code Display for WhatsApp Connection

**Input**: Design documents from `/specs/014-qr-code-display/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Unit tests included for core QR functionality

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and dependency setup

- [ ] T001 Add qrcode-terminal dependency to package.json
- [ ] T002 [P] Install qrcode-terminal package via npm
- [ ] T003 [P] Verify existing TypeScript configuration supports new dependencies

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T004 Add QR code types to src/models/whatsapp.types.ts
- [ ] T005 [P] Create QR renderer service in src/services/qr-renderer.service.ts
- [ ] T006 [P] Create QR error handler in src/services/qr-error.handler.ts
- [ ] T007 [P] Create QR configuration provider in src/services/qr-config.service.ts
- [ ] T008 Update session manager with QR detection methods in src/services/session.manager.ts
- [ ] T009 Setup QR event emitter infrastructure in src/services/qr-events.service.ts

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - First-Time WhatsApp Connection (Priority: P1) 🎯 MVP

**Goal**: Enable first-time WhatsApp connection via QR code scanning when no credentials exist

**Independent Test**: Clear auth state, run with --whatsapp-pi-online flag, verify QR code appears and can be scanned to establish connection

### Tests for User Story 1

- [ ] T010 [P] [US1] Unit test for QR renderer service in tests/unit/qr-renderer.service.test.ts
- [ ] T011 [P] [US1] Unit test for QR session management in tests/unit/qr-session.test.ts
- [ ] T012 [P] [US1] Integration test for QR flow in tests/integration/qr-flow.test.ts

### Implementation for User Story 1

- [ ] T013 [P] [US1] Implement QRCodeSession class in src/models/qr-session.model.ts
- [ ] T014 [P] [US1] Implement QRDisplayState class in src/models/qr-display-state.model.ts
- [ ] T015 [P] [US1] Implement PairingStatus enum in src/models/pairing-status.enum.ts
- [ ] T016 [US1] Add QR detection logic to WhatsApp service in src/services/whatsapp.service.ts
- [ ] T017 [US1] Implement QR code generation handler in src/services/whatsapp.service.ts
- [ ] T018 [US1] Implement QR display management in src/services/whatsapp.service.ts
- [ ] T019 [US1] Add QR refresh timer logic in src/services/whatsapp.service.ts
- [ ] T020 [US1] Implement pairing instructions display in src/services/whatsapp.service.ts
- [ ] T021 [US1] Add QR expiration warnings in src/services/whatsapp.service.ts
- [ ] T022 [US1] Update connection state transitions in src/services/whatsapp.service.ts
- [ ] T023 [US1] Add QR completion handling in src/services/whatsapp.service.ts

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Credential Reset and Re-pairing (Priority: P2)

**Goal**: Handle QR code display after logout or credential deletion for re-pairing

**Independent Test**: Run /whatsapp-logout, then run with --whatsapp-pi-online flag, verify QR code appears for re-pairing

### Tests for User Story 2

- [ ] T024 [P] [US2] Unit test for credential reset flow in tests/unit/credential-reset.test.ts
- [ ] T025 [P] [US2] Integration test for re-pairing flow in tests/integration/re-pairing.test.ts

### Implementation for User Story 2

- [ ] T026 [P] [US2] Add credential invalidation detection in src/services/session.manager.ts
- [ ] T027 [US2] Implement QR session cleanup on logout in src/services/whatsapp.service.ts
- [ ] T028 [US2] Add re-pairing state handling in src/services/whatsapp.service.ts
- [ ] T029 [US2] Update logout flow to trigger QR readiness in src/services/session.manager.ts
- [ ] T030 [US2] Add re-pairing status messages in src/services/whatsapp.service.ts

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - QR Code Display Management (Priority: P3)

**Goal**: Provide clear user feedback, instructions, and status updates during QR pairing process

**Independent Test**: Observe terminal output during QR display, verify appropriate messages and instructions are shown

### Tests for User Story 3

- [ ] T031 [P] [US3] Unit test for user instruction display in tests/unit/user-instructions.test.ts
- [ ] T032 [P] [US3] Integration test for user experience flow in tests/integration/ux-flow.test.ts

### Implementation for User Story 3

- [ ] T033 [P] [US3] Create user instruction templates in src/ui/qr-instructions.ts
- [ ] T034 [P] [US3] Implement status message formatter in src/ui/status-formatter.ts
- [ ] T035 [US3] Add progress indicators for QR states in src/services/whatsapp.service.ts
- [ ] T036 [US3] Implement terminal width detection for QR sizing in src/services/qr-renderer.service.ts
- [ ] T037 [US3] Add UTF-8 capability detection in src/services/qr-renderer.service.ts
- [ ] T038 [US3] Create fallback display for unsupported terminals in src/services/qr-renderer.service.ts
- [ ] T039 [US3] Add user-friendly error messages in src/services/qr-error.handler.ts
- [ ] T040 [US3] Implement retry suggestions in error handling in src/services/qr-error.handler.ts

**Checkpoint**: All user stories should now be independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T041 [P] Update package.json version for QR feature release
- [ ] T042 [P] Add QR feature documentation to README.md
- [ ] T043 [P] Update AGENTS.md with QR display technology stack
- [ ] T044 Code cleanup and remove console.log statements from QR implementation
- [ ] T045 [P] Performance optimization for QR rendering (<100ms target)
- [ ] T046 [P] Memory leak prevention in QR session management
- [ ] T047 Add comprehensive error logging for QR failures
- [ ] T048 [P] Update existing unit tests to account for QR functionality
- [ ] T049 [P] Run full test suite to ensure no regressions
- [ ] T050 Validate quickstart.md instructions work correctly

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Integrates with US1 session management but independently testable
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - Enhances UX for all stories but independently testable

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Models before services
- Core QR functionality before UI enhancements
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, all user stories can start in parallel (if team capacity allows)
- All tests for a user story marked [P] can run in parallel
- Models within a story marked [P] can run in parallel
- Different user stories can be worked on in parallel by different team members

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together:
Task: "Unit test for QR renderer service in tests/unit/qr-renderer.service.test.ts"
Task: "Unit test for QR session management in tests/unit/qr-session.test.ts"
Task: "Integration test for QR flow in tests/integration/qr-flow.test.ts"

# Launch all models for User Story 1 together:
Task: "Implement QRCodeSession class in src/models/qr-session.model.ts"
Task: "Implement QRDisplayState class in src/models/qr-display-state.model.ts"
Task: "Implement PairingStatus enum in src/models/pairing-status.enum.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (Core QR functionality)
   - Developer B: User Story 2 (Re-pairing flow)
   - Developer C: User Story 3 (UX enhancements)
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence

## Task Summary

- **Total Tasks**: 50
- **Setup Phase**: 3 tasks
- **Foundational Phase**: 6 tasks (CRITICAL - blocks all stories)
- **User Story 1**: 13 tasks (9 implementation + 4 tests) - MVP
- **User Story 2**: 7 tasks (5 implementation + 2 tests)
- **User Story 3**: 10 tasks (8 implementation + 2 tests)
- **Polish Phase**: 10 tasks

**MVP Scope**: Tasks T001-T023 (Setup + Foundational + User Story 1)
**Parallel Opportunities**: 32 tasks marked [P] for parallel execution
