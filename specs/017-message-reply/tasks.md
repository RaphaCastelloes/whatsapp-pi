---

description: "Task list for Message Detail Reply"
---

# Tasks: Message Detail Reply

**Input**: Design documents from `/specs/017-message-reply/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: No dedicated test tasks were requested in the feature specification.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 [P] Create the reply composer scaffold in `src/ui/message-reply.view.ts` with typed reply context props, a minimal modal entry point, and cancel/send callback hooks
- [X] T002 [P] Add reply-specific context types in `src/models/whatsapp.types.ts` for the selected message, reply draft, and reply target conversation

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 [P] Add a reply callback contract to `src/ui/message-detail.view.ts` so the detail modal can launch a reply flow for the currently selected message
- [X] T004 [P] Update `src/ui/menu.handler.ts` to pass the selected message context into `showMessageDetailView()` when opening history items so the reply flow always knows the exact message being viewed

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Reply to the Selected Message (Priority: P1) 🎯 MVP

**Goal**: Let the user start a reply from the message detail view and send it to the same conversation as the selected message.

**Independent Test**: Open a message detail view, choose Reply, enter text, and confirm the reply is sent to the same conversation as the selected message.

### Implementation for User Story 1

- [X] T005 [P] [US1] Update `src/ui/message-detail.view.ts` to surface a Reply action in the detail modal and invoke the reply composer for the currently viewed message
- [X] T006 [P] [US1] Implement the reply send flow in `src/ui/message-reply.view.ts` so the reply is delivered to the same conversation and the outgoing reply is recorded in `RecentsService`

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Preserve Reply Context for Clarity (Priority: P2)

**Goal**: Keep the original message context visible or clearly identified while composing a reply.

**Independent Test**: Open Reply from a message detail view and verify the reply composer makes it obvious which message is being answered.

### Implementation for User Story 2

- [X] T007 [US2] Enhance `src/ui/message-reply.view.ts` to display the original message context prominently in the composer so the user can verify the target before sending

**Checkpoint**: At this point, User Stories 1 and 2 should both work independently

---

## Phase 5: User Story 3 - Cancel or Exit the Reply Flow (Priority: P3)

**Goal**: Let the user cancel a reply without sending anything and return safely to the message detail view.

**Independent Test**: Open Reply from a message detail view, cancel it, and confirm the user returns to the detail view without sending anything.

### Implementation for User Story 3

- [X] T008 [US3] Add cancel/back handling in `src/ui/message-reply.view.ts` so Escape or explicit cancel returns to `src/ui/message-detail.view.ts` without sending or persisting a draft

**Checkpoint**: At this point, all user stories should be independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T009 [P] Refresh reply-related wording in `src/ui/message-detail.view.ts`, `src/ui/message-reply.view.ts`, and `specs/017-message-reply/quickstart.md` so the final interaction copy matches the implemented flow

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
- **User Story 2 (P2)**: Can start after User Story 1 wiring exists; should still be independently testable once implemented
- **User Story 3 (P3)**: Can start after User Story 1/2 reply flow exists; focuses on safe cancellation and return to detail view

### Within Each User Story

- Build the shared reply context and callback contracts before adding the reply composer behavior
- Open the reply flow before refining the context presentation
- Implement cancellation before final polish and copy updates
- Keep each story complete before moving to the next priority

### Parallel Opportunities

- `T001` and `T002` can run in parallel because they touch different files
- `T003` and `T004` can run in parallel because they establish separate parts of the reply context wiring
- After the foundation is ready, `T005` and `T006` can proceed in parallel because they split the detail view trigger from the reply delivery path

---

## Parallel Example: User Story 1

```bash
# Launch the reply wiring together:
Task: "Update src/ui/message-detail.view.ts to surface a Reply action in the detail modal and invoke the reply composer for the currently viewed message"
Task: "Implement the reply send flow in src/ui/message-reply.view.ts so the reply is delivered to the same conversation and the outgoing reply is recorded in RecentsService"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Confirm a reply can be started from the detail view and sent to the same conversation
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → foundation ready
2. Add User Story 1 → reply from detail view works end-to-end
3. Add User Story 2 → the reply composer clearly shows the original message context
4. Add User Story 3 → the user can cancel safely and return to the detail view
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once the foundation is done:
   - Developer A: Reply trigger wiring in `src/ui/message-detail.view.ts`
   - Developer B: Reply composer and send flow in `src/ui/message-reply.view.ts`
   - Developer C: Cancel/return flow and copy polish in `src/ui/message-reply.view.ts`
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Avoid vague tasks, same file conflicts, and cross-story dependencies that break independence
