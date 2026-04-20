---

description: "Task list for Message Detail View"
---

# Tasks: Message Detail View

**Input**: Design documents from `/specs/016-message-detail-view/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: No dedicated test tasks were requested in the feature specification.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 [P] Create the message detail view module scaffold in `src/ui/message-detail.view.ts` with a typed props contract and a minimal custom-component entry point

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 [P] Add history-row resolution helpers in `src/ui/menu.handler.ts` so each rendered history label can be mapped back to its underlying `RecentConversationMessage`

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Open a Message Detail View (Priority: P1) 🎯 MVP

**Goal**: Let the user select a history item and open a dedicated view that shows the selected message.

**Independent Test**: From a conversation history list, select a message and confirm a dedicated detail view opens with the full message text and message metadata.

### Implementation for User Story 1

- [X] T003 [US1] Update `showConversationHistoryForNumber()` in `src/ui/menu.handler.ts` to open the message detail flow when a history item is selected
- [X] T004 [US1] Implement the initial full-text detail screen in `src/ui/message-detail.view.ts` so the selected message opens in a dedicated view with its complete text and metadata

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Read Long or Multi-line Messages Clearly (Priority: P2)

**Goal**: Make the message detail view easy to read for long, multi-line, and richly formatted text.

**Independent Test**: Open a long message with line breaks, emojis, and special characters and verify that the full text remains readable in an adequate layout.

### Implementation for User Story 2

- [X] T005 [US2] Improve the detail layout in `src/ui/message-detail.view.ts` to preserve line breaks, wrap long text cleanly, and keep emojis and special characters readable

**Checkpoint**: At this point, User Stories 1 and 2 should both work independently

---

## Phase 5: User Story 3 - Return to the Previous Context (Priority: P3)

**Goal**: Let the user close the detail view and return to the same conversation history context.

**Independent Test**: Open a message detail view, close it, and confirm the user returns to the originating history list in the same conversation flow.

### Implementation for User Story 3

- [X] T006 [US3] Add close/back handling in `src/ui/message-detail.view.ts` so Escape or Enter dismisses the detail view
- [X] T007 [US3] Restore the originating history context in `src/ui/menu.handler.ts` after the detail view closes so the user returns to the same conversation position

**Checkpoint**: At this point, all user stories should be independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T008 Refine fallback and empty-state copy in `src/ui/message-detail.view.ts` and `src/ui/menu.handler.ts` for unreadable or empty message content
- [X] T009 Validate the finished flow against `specs/016-message-detail-view/quickstart.md` and update any wording that no longer matches the implemented behavior

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in priority order (P1 → P2 → P3)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Setup + Foundational; no dependency on later stories
- **User Story 2 (P2)**: Can start after User Story 1 wiring exists; it should still be independently usable once implemented
- **User Story 3 (P3)**: Can start after User Story 1/2 rendering exists; it focuses on return navigation from the detail view

### Within Each User Story

- Build the shared handoff and component scaffold before adding richer layout behavior
- Open the detail view before polishing its rendering
- Implement close/back handling before restoring the previous context
- Keep each story complete before moving to the next priority

### Parallel Opportunities

- `T001` and `T002` can be worked on in parallel because they touch different files and do not depend on each other
- After `T001` and `T002`, `T003` and `T004` can proceed with minimal overlap if the detail-view contract stays stable

---

## Parallel Example: User Story 1

```bash
# Launch the setup and foundation work together:
Task: "Create the message detail view module scaffold in src/ui/message-detail.view.ts with a typed props contract and a minimal custom-component entry point"
Task: "Add history-row resolution helpers in src/ui/menu.handler.ts so each rendered history label can be mapped back to its underlying RecentConversationMessage"

# Then implement the P1 story work:
Task: "Update showConversationHistoryForNumber() in src/ui/menu.handler.ts to open the message detail flow when a history item is selected"
Task: "Implement the initial full-text detail screen in src/ui/message-detail.view.ts so the selected message opens in a dedicated view with its complete text and metadata"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Confirm the selected message opens in a dedicated detail view
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → foundation ready
2. Add User Story 1 → confirm the detail view opens with full text
3. Add User Story 2 → confirm long messages remain readable
4. Add User Story 3 → confirm the user can return to the same history context
5. Each story adds value without breaking the previous ones

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once the foundation is done:
   - Developer A: User Story 1 wiring in `src/ui/menu.handler.ts`
   - Developer B: User Story 1/2 rendering work in `src/ui/message-detail.view.ts`
   - Developer C: User Story 3 navigation return flow in `src/ui/menu.handler.ts`
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Avoid vague tasks, same-file conflicts, and cross-story dependencies that break independence
