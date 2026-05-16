---

description: "Task list for Remove Passive Reaction Mode"
---

# Tasks: Remove Passive Reaction Mode

**Input**: Design documents from `/specs/033-remove-reaction-mode/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md

**Tests**: Not explicitly requested, so no test tasks included.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm removal scope and touchpoints before editing shared behavior

- [x] T001 Review Passive reaction-mode touchpoints in `src/ui/menu.handler.ts`, `src/services/session.manager.ts`, `src/models/whatsapp.types.ts`, and `src/i18n.ts` to confirm all removal targets

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared cleanup that must be in place before any user story changes can be finished

**⚠️ CRITICAL**: Complete this phase before user story work

- [x] T002 [P] Narrow `ReactionMode` in `src/models/whatsapp.types.ts` to supported values only
- [x] T003 [P] Remove Passive reaction-mode strings from `src/i18n.ts` and keep only supported labels
- [x] T004 Normalize loaded allowed-group records in `src/services/session.manager.ts` so legacy Passive values resolve to supported default behavior

**Checkpoint**: Shared reaction-mode model is now Passive-free and safe for legacy data

---

## Phase 3: User Story 1 - Remove Passive Mode Access (Priority: P1) 🎯 MVP

**Goal**: Allowed-group settings no longer expose Passive Reaction Mode

**Independent Test**: Open Allowed Groups menu and confirm no Reaction Mode submenu or Passive option appears

### Implementation for User Story 1

- [x] T005 [US1] Remove `Reaction Mode` entry from allowed-group menu in `src/ui/menu.handler.ts`
- [x] T006 [US1] Delete reaction-mode submenu logic from `src/ui/menu.handler.ts` so allowed-group menu flows directly to supported actions
- [x] T007 [US1] Remove passive-mode selection handling from `src/ui/menu.handler.ts` and stop calling now-obsolete session-manager reaction-mode APIs

**Checkpoint**: Allowed-group UI no longer offers Passive mode selection

---

## Phase 4: User Story 2 - Preserve Existing Group Behavior (Priority: P2)

**Goal**: Existing groups continue working with supported behavior after Passive removal

**Independent Test**: Load config with legacy Passive values and verify groups remain usable with supported behavior

### Implementation for User Story 2

- [x] T008 [US2] Update allowed-group load/save flow in `src/services/session.manager.ts` so legacy Passive values rewrite to the supported default mode
- [x] T009 [US2] Ensure `addAllowedGroup` and contact-merging logic in `src/services/session.manager.ts` never reintroduce Passive when group data is persisted again

**Checkpoint**: Legacy groups stay accessible and save back with supported behavior only

---

## Phase 5: User Story 3 - Avoid Broken States (Priority: P3)

**Goal**: Old Passive references do not break menu flow or persistence

**Independent Test**: Open old group data containing Passive and confirm app stays usable with no crash or blocked menu flow

### Implementation for User Story 3

- [x] T010 [US3] Remove dead Passive-specific branches from `src/services/session.manager.ts` that are no longer needed after legacy normalization
- [x] T011 [US3] Update remaining text and status output in `src/ui/menu.handler.ts` and `src/i18n.ts` so Passive is never presented as a supported choice

**Checkpoint**: Legacy Passive references are harmless and no longer surface in user-facing flows

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final cleanup and documentation consistency

- [x] T012 [P] Update `specs/033-remove-reaction-mode/quickstart.md` with final verification steps for removed Passive mode
- [x] T013 Clean dead comments, unused branches, and obsolete references tied to Passive mode in `src/ui/menu.handler.ts` and `src/services/session.manager.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup completion; blocks all user stories
- **User Stories (Phase 3+)**: Depend on Foundational completion
- **Polish (Final Phase)**: Depends on user story completion

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational; no dependency on later stories
- **User Story 2 (P2)**: Can start after Foundational; may reuse normalized data paths from US1
- **User Story 3 (P3)**: Can start after Foundational; depends on cleanup from US1/US2 to avoid stale Passive branches

### Within Each User Story

- Shared model cleanup before UI removal
- UI removal before final dead-code cleanup
- Normalize legacy data before verifying safe persistence
- Remove obsolete branches after supported behavior is stable

### Parallel Opportunities

- T002 and T003 can run in parallel because they touch different files
- T012 can run in parallel with T013 because it edits a different file
- After Phase 2, story phases can proceed in order or by staffing once shared cleanup is done

---

## Parallel Example: User Story 1

```bash
Task: "Remove `Reaction Mode` entry from allowed-group menu in `src/ui/menu.handler.ts`"
Task: "Delete reaction-mode submenu logic from `src/ui/menu.handler.ts` so allowed-group menu flows directly to supported actions"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. Validate allowed-group menu no longer exposes Passive
5. Stop if MVP is enough for release

### Incremental Delivery

1. Shared cleanup and legacy normalization
2. Remove Passive from user-facing menu
3. Preserve existing group behavior for old data
4. Remove leftover Passive branches and clean docs

### Parallel Team Strategy

With multiple developers:

1. Developer A: `src/models/whatsapp.types.ts` and `src/i18n.ts`
2. Developer B: `src/services/session.manager.ts`
3. Developer C: `src/ui/menu.handler.ts`
4. Finish with shared cleanup and quickstart update

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should remain independently deliverable
- Keep Passive removed from user-facing options and from legacy write-back paths
