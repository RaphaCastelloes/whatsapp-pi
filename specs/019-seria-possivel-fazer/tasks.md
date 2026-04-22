# Tasks: Recents Ordered by Latest Message

**Input**: Design documents from `/specs/019-seria-possivel-fazer/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish a clear recency-ordering helper so the feature has a single source of truth

- [X] T001 Add a dedicated latest-message ordering helper in `src/services/recents.service.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Update the recents rebuild flow so all user stories share the same ordering behavior

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 Update `src/services/recents.service.ts` to sort conversation summaries by latest message time when rebuilding the recents list

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - See conversations ordered by latest activity (Priority: P1) 🎯 MVP

**Goal**: Show the most recently active conversation first in Recents

**Independent Test**: Open Recents after multiple conversations receive messages at different times and verify the newest one appears first

### Implementation for User Story 1

- [X] T003 [US1] Update `src/services/recents.service.ts` so new messages move their conversation to the top of the recents list on the next open

**Checkpoint**: User Story 1 should now be fully functional and independently usable

---

## Phase 4: User Story 2 - Keep each conversation represented once (Priority: P2)

**Goal**: Keep Recents as one entry per conversation while using the latest message as the ranking reference

**Independent Test**: Send multiple messages in the same conversation, open Recents, and verify the conversation appears only once with the latest activity reflected

### Implementation for User Story 2

- [X] T004 [US2] Consolidate repeated messages into a single recents entry per conversation in `src/services/recents.service.ts`

**Checkpoint**: User Story 2 should now keep Recents deduplicated and easy to scan

---

## Phase 5: User Story 3 - Preserve empty and small-list behavior (Priority: P3)

**Goal**: Keep the empty-state message and Back flow intact while showing the reordered recents list

**Independent Test**: Open Recents with no conversations and verify the empty state still appears; open with a few conversations and verify the list remains usable

### Implementation for User Story 3

- [X] T005 [P] [US3] Preserve the empty-state and Back navigation flow in `src/ui/menu.handler.ts` while using the reordered recents list

**Checkpoint**: User Story 3 should now behave correctly for empty and small recents sets

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and cleanup across all user stories

- [X] T006 Validate the ordering behavior against `specs/019-seria-possivel-fazer/quickstart.md` and adjust `src/services/recents.service.ts` if any tie-breaker or edge-case issue remains

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - blocks all user stories
- **User Stories (Phase 3+)**: Depend on Foundational completion
- **Polish (Final Phase)**: Depends on all user story work being complete

### User Story Dependencies

- **User Story 1 (P1)**: Starts after Foundational; establishes the latest-message ordering
- **User Story 2 (P2)**: Starts after Foundational; ensures one entry per conversation
- **User Story 3 (P3)**: Starts after Foundational; preserves empty-state behavior

### Within Each User Story

- Complete the story-specific implementation before moving to the next priority
- Keep each story independently verifiable from the Recents menu
- Avoid introducing cross-story dependencies that break the ordering or empty-state behavior

### Parallel Opportunities

- `T005` can be worked on in parallel with `T003` and `T004` because it touches a different file (`src/ui/menu.handler.ts`)
- `T006` should run after the implementation tasks complete so it can validate the final behavior end-to-end

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. Stop and validate that the newest conversation now appears first

### Incremental Delivery

1. Complete Setup + Foundational
2. Deliver User Story 1 to order Recents by latest activity
3. Deliver User Story 2 to keep one entry per conversation
4. Deliver User Story 3 to preserve empty-state behavior
5. Run the final validation pass from `quickstart.md`

### Parallel Team Strategy

- This feature is small and primarily touches `src/services/recents.service.ts`
- One contributor can focus on the ordering helper and summary rebuild flow while another handles the menu-preservation task in `src/ui/menu.handler.ts`
- Merge carefully because most work concentrates in the same recents service file

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should remain independently completable and testable
- Commit after each task or logical group
- Avoid vague tasks and avoid hidden dependencies between stories
