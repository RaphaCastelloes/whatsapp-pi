# Tasks: Verbose Mode Support

**Input**: Design documents from `specs/005-verbose-mode-support/`
**Prerequisites**: plan.md (required), spec.md (required)

**Tests**: Manual CLI verification is primary. Unit tests for logger level mapping are included.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Parallelizable (different files, no dependencies)
- **[Story]**: [US1], [US2]

---

## Phase 1: Setup (Project Initialization)

**Purpose**: Prepare the project for flag support.

- [X] T001 Ensure `pino` dependency is correctly installed and available for custom logger creation.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core service updates to support dynamic logging levels.

- [X] T002 Update `WhatsAppService` constructor and `start()` method in `src/services/whatsapp.service.ts` to accept an `isVerbose` boolean.
- [X] T003 Implement log level mapping logic (Verbose -> 'trace', Quiet -> 'silent') in `src/services/whatsapp.service.ts`.
- [X] T004 [P] Create unit test for log level mapping in a new test file `tests/unit/logger.test.ts`.

---

## Phase 3: User Story 1 & 2 - Verbose Toggle (Priority: P1) 🎯 MVP

**Goal**: As a user, I want to use the `-v` flag to see trace data or omit it for clean output.

**Independent Test**: Run `pi -e ./whatsapp-pi.ts -v` and verify socket traces appear; then run without `-v` and verify they are hidden.

- [X] T005 Register the `verbose` flag using `pi.registerFlag` in `whatsapp-pi.ts`.
- [X] T006 Implement flag detection logic using `pi.getFlag("--verbose")` (or `-v`) during the extension activation in `whatsapp-pi.ts`.
- [X] T007 Pass the detected verbosity state to the `WhatsAppService` initialization.
- [X] T008 Update internal custom logging in `src/services/message.sender.ts` to respect the verbosity state (optional but recommended for consistency).

**Checkpoint**: Core feature is complete. Users can control terminal output verbosity via CLI arguments.

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and documentation updates.

- [X] T009 [P] Update `specs/005-verbose-mode-support/quickstart.md` with any final implementation details.
- [X] T010 Verify that the `-v` flag works correctly in both interactive and non-interactive Pi modes.
