# Tasks: Migrate Extension Storage Path

**Input**: Design documents from `/specs/035-storage-path-migration/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md

**Organization**: Tasks are grouped by user story so each story can be implemented and validated independently.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the shared storage-path entry point used by all later work.

- [X] T001 Create shared storage-path module scaffold in src/services/storage-path.ts with canonical new and legacy root exports

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Central path resolution and migration-safe helpers that all stories depend on.

**⚠️ CRITICAL**: No user story work should begin until these helpers exist.

- [X] T002 Implement path helpers in src/services/storage-path.ts for storage root, legacy root, auth dir, config path, recents dir/store, and log dir
- [X] T003 Add migration-safe directory bootstrap and best-effort existence checks in src/services/storage-path.ts

**Checkpoint**: Shared storage root is defined and ready for service refactors.

---

## Phase 3: User Story 1 - Use New Storage Location (Priority: P1) 🎯 MVP

**Goal**: New writes land only in `~/.pi/agent/extension/whatsapp-pi`.

**Independent Test**: Clean install creates only the new storage root, and new auth/config/recents/log files appear there.

- [X] T004 [P] [US1] Refactor src/services/session.manager.ts to resolve auth state and config paths through src/services/storage-path.ts
- [X] T005 [P] [US1] Refactor src/services/recents.service.ts to persist recents under the new storage root via src/services/storage-path.ts
- [X] T006 [P] [US1] Refactor src/services/whatsapp-pi.logger.ts, src/services/message.sender.ts, and src/services/whatsapp.service.ts to write log files through src/services/storage-path.ts

**Checkpoint**: Fresh runs should write only to the new extension storage home.

---

## Phase 4: User Story 2 - Keep Existing Data Working (Priority: P2)

**Goal**: Existing local data remains usable after upgrade, with no manual file moves.

**Independent Test**: Seed legacy `~/.pi/whatsapp-pi` data, start app, and confirm auth/config/recents/logs remain available from new storage.

- [X] T007 [P] [US2] Add automatic legacy auth/config migration in src/services/session.manager.ts so readable data from ~/.pi/whatsapp-pi is copied into new storage on startup
- [X] T008 [P] [US2] Add legacy recents-store import in src/services/recents.service.ts so existing conversation history remains available after first launch
- [X] T009 [P] [US2] Add legacy log-file carry-forward in src/services/whatsapp-pi.logger.ts so old log output is preserved under the new storage root

**Checkpoint**: Existing users should keep their data after upgrade without manual migration.

---

## Phase 5: User Story 3 - Avoid Manual Migration Steps (Priority: P3)

**Goal**: No one needs to copy folders or edit config by hand.

**Independent Test**: Upgrade from legacy install with zero manual file moves; docs point to new home and fallback behavior.

- [X] T010 [P] [US3] Remove remaining `~/.pi/whatsapp-pi` literals from src/**/*.ts and tests/**/*.ts by replacing them with storage helper usage
- [X] T011 [P] [US3] Update README.md and specs/035-storage-path-migration/quickstart.md to document the new storage home and automatic legacy fallback

**Checkpoint**: User-facing guidance and code references should no longer point users to the legacy folder.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final sweep for safety and consistency.

- [X] T012 Review src/services/session.manager.ts startup failure handling so unreadable or unavailable new storage surfaces a clear recoverable state

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1**: No dependencies
- **Phase 2**: Depends on Phase 1
- **Phase 3 (US1)**: Depends on Phase 2
- **Phase 4 (US2)**: Depends on Phase 2; may use US1 work but should remain independently testable
- **Phase 5 (US3)**: Depends on Phase 3 and Phase 4 outputs for final cleanup
- **Phase 6**: Depends on all desired story work

### User Story Dependencies

- **US1 (P1)**: Base path switch; no dependency on other user stories
- **US2 (P2)**: Uses shared storage helpers; may rely on US1 path wiring but still testable with legacy data seed
- **US3 (P3)**: Cleanup and docs; depends on finalized path behavior from US1/US2

### Parallel Opportunities

- T004, T005, and T006 can run in parallel after Phase 2
- T007, T008, and T009 can run in parallel after Phase 2
- T010 and T011 can run in parallel after Phase 4

---

## Parallel Example: User Story 1

```bash
Task: "Refactor src/services/session.manager.ts to resolve auth state and config paths through src/services/storage-path.ts"
Task: "Refactor src/services/recents.service.ts to persist recents under the new storage root via src/services/storage-path.ts"
Task: "Refactor src/services/whatsapp-pi.logger.ts, src/services/message.sender.ts, and src/services/whatsapp.service.ts to write log files through src/services/storage-path.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Finish Phase 1 and Phase 2.
2. Complete Phase 3.
3. Validate clean install writes only to `~/.pi/agent/extension/whatsapp-pi`.
4. Stop if MVP is enough.

### Incremental Delivery

1. Build shared storage helpers.
2. Move live writes to new root.
3. Add legacy migration for existing installs.
4. Remove manual-move friction and update docs.
5. Polish failure handling.

### Parallel Team Strategy

1. One developer owns `session.manager.ts`.
2. One developer owns recents + logging paths.
3. One developer owns migration flow.
4. One developer owns docs cleanup.

---

## Notes

- [P] tasks can run in parallel only when they touch different files and have no dependency on unfinished work.
- Every task includes an exact file path.
- No test tasks were added because tests were not explicitly requested.
