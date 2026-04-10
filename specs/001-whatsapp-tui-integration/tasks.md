# Tasks: WhatsApp TUI Integration

**Input**: Design documents from `specs/001-whatsapp-tui-integration/`
**Prerequisites**: plan.md (required), spec.md (required)

**Tests**: Unit tests are included to ensure reliability of session and message filtering logic.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Parallelizable (different files, no dependencies)
- **[Story]**: [US1], [US2], [US3], [US4]

---

## Phase 1: Setup (Project Initialization)

**Purpose**: Project initialization and structure setup.

- [X] T001 Create project structure per implementation plan in src/ and tests/
- [X] T002 Initialize npm project and install dependencies: `@whiskeysockets/baileys`, `qrcode-terminal`
- [X] T003 [P] Configure TypeScript with strict mode and Node.js target in tsconfig.json
- [X] T004 [P] Setup Jest for TypeScript testing in jest.config.js

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure for WhatsApp connectivity and session state.

- [X] T005 Create base types and interfaces in src/models/whatsapp.types.ts
- [X] T006 Implement SessionManager to handle Baileys useMultiFileAuthState in src/services/session.manager.ts
- [X] T007 [P] Implement base WhatsAppService class with socket initialization in src/services/whatsapp.service.ts
- [X] T008 [P] Register `/whatsapp` command and menu boilerplate in src/ui/menu.handler.ts

---

## Phase 3: User Story 1 - Initial Setup & Pairing (Priority: P1) 🎯 MVP

**Goal**: Allow users to pair their WhatsApp account via QR code in the TUI.

**Independent Test**: Run `/whatsapp`, select Login, scan QR code, and verify session persistence.

- [X] T009 [P] [US1] Create unit test for session persistence in tests/unit/session.manager.test.ts
- [X] T010 [US1] Implement QR code generation and TUI rendering using qrcode-terminal in src/services/whatsapp.service.ts
- [X] T011 [US1] Implement "Login" action in src/ui/menu.handler.ts to trigger QR generation
- [X] T012 [US1] Handle Baileys `connection.update` to detect successful pairing and update state
- [X] T013 [US1] Verify session credentials are saved to `.pi/extensions/whatsapp/`

**Checkpoint**: User can now pair their account and see a success message.

---

## Phase 4: User Story 2 - Message Handling Control (Priority: P2)

**Goal**: Enable/Disable the Agent's response capability.

**Independent Test**: Toggle Connect/Disconnect and verify if socket events are processed or ignored.

- [X] T014 [US2] Add `status` field to WhatsAppSession and implement toggle methods in src/services/session.manager.ts
- [X] T015 [US2] Implement "Connect" and "Disconnect" actions in src/ui/menu.handler.ts
- [X] T016 [US2] Update menu visibility logic based on session status in src/ui/menu.handler.ts
- [X] T017 [US2] Implement Baileys `messages.upsert` listener that respects the "Connect" status in src/services/whatsapp.service.ts

**Checkpoint**: User can start/stop message processing via the TUI menu.

---

## Phase 5: User Story 3 - Recipient Filtering (Priority: P2)

**Goal**: Restrict Agent interaction to allowed numbers only.

**Independent Test**: Add a number to the list and verify messages from others are ignored.

- [X] T018 [P] [US3] Create unit tests for AllowList filtering logic in tests/unit/whatsapp.service.test.ts
- [X] T019 [US3] Implement AllowList storage and management in src/services/session.manager.ts
- [X] T020 [US3] Implement "Allow Numbers" sub-menu for viewing and adding numbers in src/ui/menu.handler.ts
- [X] T021 [US3] Implement phone number validation (international format) in src/models/whatsapp.types.ts
- [X] T022 [US3] Integrate AllowList check into `messages.upsert` logic in src/services/whatsapp.service.ts

**Checkpoint**: Agent only responds to messages from authorized numbers.

---

## Phase 6: User Story 4 - Session Management (Priority: P3)

**Goal**: Allow users to log off and delete credentials.

**Independent Test**: Select Logoff and verify that auth files are deleted and session is killed.

- [X] T023 [US4] Implement credential deletion logic in src/services/session.manager.ts
- [X] T024 [US4] Implement "Logoff" action in src/ui/menu.handler.ts
- [X] T025 [US4] Ensure socket is closed and all resources are released upon logoff in src/services/whatsapp.service.ts

**Checkpoint**: User can securely wipe their session.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Cleanup and final validation.

- [X] T026 [P] Add logging for connection errors and message processing in src/services/whatsapp.service.ts
- [X] T027 [P] Update quickstart.md with final implementation details
- [X] T028 Run all tests and verify SC-001 to SC-004 from spec.md

---

## Dependencies & Execution Order

1. **Setup (Phase 1)** -> **Foundational (Phase 2)**
2. **Foundational (Phase 2)** -> **US1 (Phase 3)**
3. **US1 (Phase 3)** -> **US2 (Phase 4)** & **US3 (Phase 5)** & **US4 (Phase 6)** (Session management can be worked in parallel once pairing works)

---

## Parallel Execution Examples

### US1 Parallel Tasks
- T009 [US1] (Tests) and T010 [US1] (QR Logic) can start together.

### US3 Parallel Tasks
- T018 [US3] (Tests) and T019 [US3] (Storage) can start together.

---

## Implementation Strategy

1. **MVP First**: Complete Phase 1-3. At this point, the core pairing works.
2. **Incremental Delivery**: Add US2 (Control) and US3 (Filtering) to make the integration safe and useful.
3. **Polish**: Finalize session cleanup and documentation.
