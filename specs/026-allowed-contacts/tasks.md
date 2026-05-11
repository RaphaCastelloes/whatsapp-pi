---

description: "Task list for Allowed Contacts Rename"
---

# Tasks: Allowed Contacts Rename

**Input**: Design documents from `/specs/026-allowed-contacts/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by user story so each story can be implemented and verified independently.

## Phase 1: Setup (Shared Preparation)

**Purpose**: Confirm all affected wording and file locations before editing shared labels.

- [X] T001 [P] Review allow-list wording usage in `src/i18n.ts`, `src/ui/menu.handler.ts`, and `tests/unit/menu.handler.test.ts` to map every `Allowed Numbers` user-facing string that must change

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared wording source must be updated before story-specific UI wiring.

- [X] T002 Update shared allow-list terminology in `src/i18n.ts` for all locales so the root menu label and allow-list titles use `Allowed Contacts` instead of `Allowed Numbers`

**Checkpoint**: Shared terminology is updated and story-specific menu wiring can proceed.

---

## Phase 3: User Story 1 - Rename Main Menu Entry (Priority: P1) 🎯 MVP

**Goal**: `/whatsapp` shows `Allowed Contacts` in place of `Allowed Numbers`.

**Independent Test**: Open `/whatsapp` and verify the main menu entry and allow-list title display `Allowed Contacts`.

### Implementation for User Story 1

- [X] T003 [US1] Update `src/ui/menu.handler.ts` to use the renamed allow-list label in the `/whatsapp` menu and keep menu navigation unchanged
- [X] T004 [US1] Update `tests/unit/menu.handler.test.ts` expectations for the `/whatsapp` menu label and submenu selection text to match `Allowed Contacts`

**Checkpoint**: Main menu entry is renamed and independently verifiable.

---

## Phase 4: User Story 2 - Keep Contact Flow Language Consistent (Priority: P2)

**Goal**: Every allow-list screen uses the same `Allowed Contacts` wording.

**Independent Test**: Walk the allow-list flow and confirm no visible text still says `Allowed Numbers`.

### Implementation for User Story 2

- [X] T005 [US2] Update remaining allow-list copy in `src/i18n.ts` for prompts, confirmations, notifications, empty states, and detail titles so they consistently say `Allowed Contacts`
- [X] T006 [US2] Review `src/ui/menu.handler.ts` for any remaining hardcoded allow-list wording or variable names tied to `Allowed Numbers` and align them with the renamed terminology

**Checkpoint**: Allow-list flow language is consistent across all user-facing screens.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Final consistency pass across docs and references.

- [X] T007 [P] Update `specs/026-allowed-contacts/contracts/menu-contract.md` and `specs/026-allowed-contacts/quickstart.md` to reflect `Allowed Contacts` terminology
- [X] T008 [P] Clean up stale `Allowed Numbers` references in comments and naming within `src/ui/menu.handler.ts` and `src/i18n.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1**: No dependencies
- **Phase 2**: Depends on Phase 1 completion
- **Phase 3 (US1)**: Depends on Phase 2 completion
- **Phase 4 (US2)**: Depends on Phase 3 completion
- **Phase 5 (Polish)**: Depends on desired user stories being complete

### User Story Dependencies

- **US1**: No dependency on US2; serves as MVP rename
- **US2**: Uses the same shared terminology updates and should run after US1 to finish the full wording pass

### Parallel Opportunities

- T001 can run in parallel with documentation review work outside code changes
- T004 and T005 can be split further if later needed, but current plan keeps them sequential to avoid label drift
- T007 and T008 can run in parallel because they touch different files

---

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2
2. Complete Phase 3 (US1)
3. Verify `/whatsapp` shows `Allowed Contacts`
4. Stop if only MVP is needed

### Incremental Delivery

1. Rename main menu entry first
2. Finish wording consistency across the allow-list flow
3. Polish docs and stale references last

## Task Format Validation

All tasks follow: `- [ ] T### [P?] [US?] Description with file path`
