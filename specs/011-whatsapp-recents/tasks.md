---

description: "Task list for WhatsApp Recents Menu"
---

# Tasks: WhatsApp Recents Menu

**Input**: Design documents from `/specs/011-whatsapp-recents/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md

**Tests**: No explicit automated test tasks were requested in the feature specification, so this task list focuses on implementation and validation support.

**Organization**: Tasks are grouped by user story to keep each increment independently deliverable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the shared data structures and service scaffold needed by every Recents flow

- [x] T001 [P] Define recents-related domain types and persistence metadata in `src/models/whatsapp.types.ts`
- [x] T002 [P] Create the Recents service scaffold in `src/services/recents.service.ts` with constructor, public API shape, and file-path constants

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the shared Recents cache behavior that all user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Implement Recents cache load/save, sorting, and 20-item trimming rules in `src/services/recents.service.ts`
- [x] T004 [P] Update `src/services/whatsapp.service.ts` so incoming WhatsApp messages are recorded into the Recents cache
- [x] T005 [P] Wire the Recents service into `whatsapp-pi.ts` startup and outgoing message handling so sent replies also refresh recent conversations

**Checkpoint**: Recents data is being captured and persisted; user story work can now begin

---

## Phase 3: User Story 1 - View Recent Conversations (Priority: P1) 🎯 MVP

**Goal**: Let the user open Recents from `/whatsapp` and scan the latest individual conversations

**Independent Test**: Open `/whatsapp`, choose Recents, and confirm the list shows the expected sender, time, and last-message preview for up to 20 individual conversations

### Implementation for User Story 1

- [x] T006 [US1] Add the Recents entry point to the `/whatsapp` menu in `src/ui/menu.handler.ts`
- [x] T007 [P] [US1] Render the Recents list with sender, last-message time, and message preview in `src/ui/menu.handler.ts`
- [x] T008 [US1] Add empty-state handling and enforce the 20-conversation display limit in `src/ui/menu.handler.ts`

**Checkpoint**: Recents can be opened and reviewed independently as the MVP slice

---

## Phase 4: User Story 2 - Manage a Recent Conversation (Priority: P2)

**Goal**: Let the user act on a selected conversation with Allow Number, Send Message, History, and Back options

**Independent Test**: Select any item from Recents and confirm the action menu appears, Allow Number updates the allow list, and Send Message prompts for text and sends it to the chosen sender

### Implementation for User Story 2

- [x] T009 [US2] Add the per-conversation action menu and selected-sender navigation flow in `src/ui/menu.handler.ts`
- [x] T010 [P] [US2] Connect Allow Number to `SessionManager.addNumber` and show confirmation in `src/ui/menu.handler.ts`
- [x] T011 [P] [US2] Connect Send Message to a text input prompt and `WhatsAppService.sendMessage` in `src/ui/menu.handler.ts`

**Checkpoint**: A selected recent conversation can be allowed or replied to without leaving the Recents flow

---

## Phase 5: User Story 3 - Review Conversation History (Priority: P3)

**Goal**: Let the user open the latest message history for a selected conversation and return back to the action menu

**Independent Test**: Select a recent conversation, choose History, and confirm the last 20 messages are shown with a Back option that returns to the action menu

### Implementation for User Story 3

- [x] T012 [P] [US3] Add bounded per-conversation history retrieval and message-order formatting in `src/services/recents.service.ts`
- [x] T013 [US3] Add the History view and Back navigation to `src/ui/menu.handler.ts`

**Checkpoint**: Conversation history is available and navigable without breaking the action menu flow

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final cleanup and consistency work across all Recents flows

- [x] T014 [P] Tighten TypeScript types and remove any temporary casts introduced for the Recents flow in `src/models/whatsapp.types.ts`, `src/services/recents.service.ts`, `src/services/whatsapp.service.ts`, and `src/ui/menu.handler.ts`
- [x] T015 Verify the manual walkthrough in `specs/011-whatsapp-recents/quickstart.md` and update wording if menu labels or flow details changed

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in priority order or in parallel where staffing allows
- **Polish (Final Phase)**: Depends on the desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational phase - no dependency on other stories
- **User Story 2 (P2)**: Can start after Foundational phase - reuses the Recents list but remains independently testable
- **User Story 3 (P3)**: Can start after Foundational phase - reuses the Recents cache but remains independently testable

### Within Each User Story

- Shared cache work must be complete before any story-specific menu work
- Menu navigation should be implemented before its dependent action handling
- History retrieval should be implemented before the History view
- Keep each story usable on its own before moving to the next priority

### Parallel Opportunities

- `T001` and `T002` can run in parallel during setup
- `T004` and `T005` can run in parallel once the cache service exists
- `T007` and `T008` can be split if menu rendering and empty-state handling are worked on separately
- `T010` and `T011` can be implemented in parallel because they touch different action paths in the same menu
- `T012` can be worked on independently from the UI-facing `T013`
- `T014` and `T015` can run in parallel during polish

---

## Parallel Example: User Story 1

```bash
# Build the Recents list behavior in parallel after foundational work:
Task: "Render the Recents list with sender, last-message time, and message preview in src/ui/menu.handler.ts"
Task: "Add empty-state handling and enforce the 20-conversation display limit in src/ui/menu.handler.ts"
```

---

## Parallel Example: User Story 2

```bash
# Split the action menu work across independent branches of the same flow:
Task: "Connect Allow Number to SessionManager.addNumber and show confirmation in src/ui/menu.handler.ts"
Task: "Connect Send Message to a text input prompt and WhatsAppService.sendMessage in src/ui/menu.handler.ts"
```

---

## Parallel Example: User Story 3

```bash
# Separate storage retrieval from the UI view:
Task: "Add bounded per-conversation history retrieval and message-order formatting in src/services/recents.service.ts"
Task: "Add the History view and Back navigation to src/ui/menu.handler.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. Stop and verify the Recents list is usable on its own

### Incremental Delivery

1. Deliver the shared cache foundation
2. Ship User Story 1 as the MVP: browse recent conversations
3. Add User Story 2: act on a selected conversation
4. Add User Story 3: inspect conversation history
5. Finish with polish and consistency updates

### Parallel Team Strategy

With multiple developers:

1. One developer prepares the shared cache foundation
2. After the foundation is ready:
   - Developer A works on User Story 1 list rendering
   - Developer B works on User Story 2 action handling
   - Developer C works on User Story 3 history retrieval and view
3. Polish tasks are completed together at the end

---

## Notes

- [P] tasks = different files or independent code paths with no blocking dependency
- [Story] label maps each task to a specific user story for traceability
- Keep the Recents feature local, bounded, and menu-driven to match the existing UX
- Verify the MVP flow before moving to higher-priority follow-up actions
