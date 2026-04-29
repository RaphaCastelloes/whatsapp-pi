# Tasks: Audio Service Test Coverage

**Input**: Design documents from `/specs/021-increase-unit-test/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Yes. This feature is specifically about increasing unit test coverage for `src/services/audio.service.ts`.

**Organization**: Tasks are grouped by user story so each coverage scenario can be implemented and verified independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish a deterministic unit test harness for `src/services/audio.service.ts`

- [X] T001 Create `tests/unit/audio.service.test.ts` with hoisted mocks for `@whiskeysockets/baileys`, `node:child_process`, `node:fs/promises`, `node:fs`, and `node:os`
- [X] T002 [P] Add reusable test helpers inside `tests/unit/audio.service.test.ts` for async audio stream chunks, console spying, and mock reset/restore behavior

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Lock in the service import seams so all transcription scenarios can be tested deterministically

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 Verify `AudioService` construction and media-directory setup in `tests/unit/audio.service.test.ts` using mocked `existsSync` and `mkdir`
- [X] T004 [P] Verify the service uses the mocked homedir-based media path in `tests/unit/audio.service.test.ts` so all later assertions target the same deterministic location

**Checkpoint**: Test harness is ready - transcription scenarios can now be covered independently

---

## Phase 3: User Story 1 - Verify successful audio transcription flow (Priority: P1) 🎯 MVP

**Goal**: Prove the happy path works and returns trimmed transcription text

**Independent Test**: Simulate a valid audio message, a streamed download, a generated txt file, and verify the returned transcription is trimmed text

### Tests for User Story 1

- [X] T005 [P] [US1] Add a success-path test in `tests/unit/audio.service.test.ts` that downloads audio chunks, writes the `.ogg` file, executes transcription, and returns trimmed txt content
- [X] T006 [P] [US1] Add a chunk-assembly test in `tests/unit/audio.service.test.ts` that verifies multiple audio chunks are concatenated into one buffer before `writeFile`

**Checkpoint**: User Story 1 coverage proves the normal transcription flow and output trimming

---

## Phase 4: User Story 2 - Verify empty transcription behavior (Priority: P2)

**Goal**: Prove the service returns the documented fallback when no readable transcription exists

**Independent Test**: Simulate a completed transcription run with no txt output file and verify the fallback text is returned

### Tests for User Story 2

- [X] T007 [P] [US2] Add a missing-output test in `tests/unit/audio.service.test.ts` that returns `[Empty transcription]` when the txt file does not exist
- [X] T008 [P] [US2] Add a whitespace-output test in `tests/unit/audio.service.test.ts` that verifies whitespace-only transcription content is trimmed to an empty string

**Checkpoint**: User Story 2 coverage proves empty-result behavior stays predictable

---

## Phase 5: User Story 3 - Verify transcription error behavior (Priority: P3)

**Goal**: Prove download or processing failures return a clear error string without escaping to the caller

**Independent Test**: Simulate download failure and transcription execution failure, then verify the service returns formatted error text and logs the failure

### Tests for User Story 3

- [X] T009 [P] [US3] Add a download-failure test in `tests/unit/audio.service.test.ts` that verifies `transcribe()` returns a formatted transcription error string
- [X] T010 [P] [US3] Add a transcription-exec failure test in `tests/unit/audio.service.test.ts` that verifies `transcribe()` logs the failure and returns a formatted transcription error string

**Checkpoint**: User Story 3 coverage proves failure handling remains safe and user-friendly

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validate coverage gains and keep the audio service test suite stable

- [X] T011 Run `npm test -- --coverage` and `npm run typecheck`, then fix any regressions in `tests/unit/audio.service.test.ts` or `src/services/audio.service.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: Depend on Foundational phase completion
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational phase - no dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational phase - independent from other stories
- **User Story 3 (P3)**: Can start after Foundational phase - independent from other stories

### Within Each User Story

- Build shared test harness first
- Success-path coverage should be added before fallback/failure branches
- Tests that touch different mocked branches can run in parallel when they do not modify the same setup
- Keep assertions focused on return values and explicit side effects

### Parallel Opportunities

- **Setup**: T002 can run in parallel with T001 after the test file exists
- **Foundational**: T004 can run in parallel with T003 after the shared harness is in place
- **User Story 1**: T005 and T006 can run in parallel after shared mocks are ready
- **User Story 2**: T007 and T008 can run in parallel after shared mocks are ready
- **User Story 3**: T009 and T010 can run in parallel after shared mocks are ready

---

## Parallel Example: User Story 1

```bash
Task: "Add a success-path test in tests/unit/audio.service.test.ts that downloads audio chunks, writes the .ogg file, executes transcription, and returns trimmed txt content"
Task: "Add a chunk-assembly test in tests/unit/audio.service.test.ts that verifies multiple audio chunks are concatenated into one buffer before writeFile"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Run the audio service tests and confirm happy-path coverage is green
5. Continue only if baseline coverage is stable

### Incremental Delivery

1. Complete Setup + Foundational → deterministic audio-service harness ready
2. Add User Story 1 → happy-path transcription coverage
3. Add User Story 2 → fallback behavior coverage
4. Add User Story 3 → failure-handling coverage
5. Run polish validation and confirm coverage increased over baseline

### Parallel Team Strategy

With multiple developers:

1. Team prepares the shared test harness together
2. Once foundational mocks are ready:
   - Developer A: User Story 1 tests
   - Developer B: User Story 2 tests
   - Developer C: User Story 3 tests
3. Finish with coverage validation and type checking

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing if doing TDD-style updates
- Avoid real transcription execution, real filesystem dependency, and real network dependency in unit tests
