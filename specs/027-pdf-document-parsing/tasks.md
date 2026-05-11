# Tasks: PDF Document Parsing

**Input**: Design documents from `/specs/027-pdf-document-parsing/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md

**Tests**: Unit tests are included because the feature spec calls for coverage of successful PDF extraction, parsing failure fallback, and non-PDF behavior.

**Organization**: Tasks are grouped by user story so each story can be implemented and tested independently.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project setup and shared dependency wiring

- [X] T001 Add `@llamaindex/liteparse` to `package.json` and refresh `package-lock.json` for the new PDF parser dependency
- [X] T002 [P] Add shared PDF preview and fallback message strings in `src/i18n.ts` for document notifications

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core document-processing building blocks needed before story work

- [X] T003 Create bounded PDF preview helpers and parser entry points in `src/services/incoming-media.service.ts`

**Checkpoint**: PDF save/parse/fallback primitives are ready for user story implementation

---

## Phase 3: User Story 1 - Read PDF Content (Priority: P1) 🎯 MVP

**Goal**: Save a received PDF and include readable text when extraction succeeds

**Independent Test**: Send a text-based PDF and verify the file is saved, the forwarded message includes a bounded preview, and the saved path stays authoritative.

### Tests for User Story 1 (OPTIONAL - only if tests requested) ⚠️

- [X] T004 [P] [US1] Add success-path coverage for PDF preview generation in `tests/unit/incoming-media.service.test.ts`

### Implementation for User Story 1

- [X] T005 [US1] Implement PDF save-then-parse flow with bounded preview assembly in `src/services/incoming-media.service.ts`

**Checkpoint**: User Story 1 should now save PDFs and forward readable previews independently

---

## Phase 4: User Story 2 - Preserve Access When Parsing Fails (Priority: P2)

**Goal**: Keep the saved PDF and send a clear fallback notice when text extraction fails

**Independent Test**: Send an encrypted, scanned, malformed, or otherwise unreadable PDF and verify the file is still saved and the notification explains the fallback.

### Tests for User Story 2 (OPTIONAL - only if tests requested) ⚠️

- [X] T006 [P] [US2] Add fallback-path coverage for unreadable PDFs in `tests/unit/incoming-media.service.test.ts`

### Implementation for User Story 2

- [X] T007 [US2] Implement parser failure fallback that preserves metadata and the saved path in `src/services/incoming-media.service.ts`

**Checkpoint**: User Story 2 should now fail open while preserving document storage

---

## Phase 5: User Story 3 - Keep Other Document Flows Stable (Priority: P3)

**Goal**: Preserve non-PDF behavior and remove the host-level PDF utility dependency from startup

**Independent Test**: Send a non-PDF document and confirm existing handling remains unchanged; restart the extension and confirm no `pdftotext` check runs.

### Tests for User Story 3 (OPTIONAL - only if tests requested) ⚠️

- [X] T008 [P] [US3] Add non-PDF regression coverage in `tests/unit/incoming-media.service.test.ts`
- [X] T009 [P] [US3] Add startup regression coverage for removal of the `pdftotext` check in `tests/unit/whatsapp-pi.extension.test.ts`

### Implementation for User Story 3

- [X] T010 [US3] Remove the `pdftotext` startup check and warning from `whatsapp-pi.ts`
- [X] T011 [US3] Keep non-PDF document handling on the existing path in `src/services/incoming-media.service.ts`

**Checkpoint**: All document flows should remain stable while PDF handling improves

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final cleanup and documentation updates

- [X] T012 [P] Update `README.md` with PDF preview behavior, fallback handling, and saved-path guidance
- [X] T013 [P] Validate the steps in `specs/027-pdf-document-parsing/quickstart.md` against the final implementation and adjust wording if needed

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion; blocks all user stories
- **User Stories (Phase 3+)**: Depend on Foundational completion
- **Polish (Phase 6)**: Depends on desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: No dependency on other stories after foundation
- **User Story 2 (P2)**: Can start after foundation; builds on the same document path
- **User Story 3 (P3)**: Can start after foundation; protects existing behavior and startup flow

### Within Each User Story

- Tests are written before implementation
- Shared helpers before story-specific behavior
- Save path remains canonical before any preview logic
- Fallback behavior must never block document storage

## Parallel Opportunities

- `T001` and `T002` can run in parallel
- `T004` can run in parallel with `T005` after foundational work is ready
- `T006` can run in parallel with `T007` after User Story 1 work is in place
- `T008` and `T009` can run in parallel
- `T012` and `T013` can run in parallel

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Setup and Foundational tasks
2. Implement User Story 1
3. Validate PDF save + preview flow independently
4. Stop if MVP is sufficient

### Incremental Delivery

1. Add PDF preview for readable documents
2. Add graceful fallback for unreadable PDFs
3. Remove startup dependency on `pdftotext`
4. Confirm non-PDF behavior stays unchanged
5. Finish with docs and quickstart validation

### Parallel Team Strategy

- One developer can handle dependency/setup work
- Another can prepare success-path tests
- Another can prepare fallback and regression tests
- Implementation can land story by story without blocking unrelated work

## Task Count Summary

- Setup: 2 tasks
- Foundational: 1 task
- User Story 1: 2 tasks
- User Story 2: 2 tasks
- User Story 3: 4 tasks
- Polish: 2 tasks
- **Total**: 13 tasks

## Validation

- All tasks use the required checklist format
- All user-story tasks include `[US#]` labels
- All implementation tasks include exact file paths
- Parallel tasks are marked with `[P]` only where safe
