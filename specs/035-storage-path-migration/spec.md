# Feature Specification: Migrate Extension Storage Path

**Feature Branch**: `[035-storage-path-migration]`  
**Created**: 2026-06-02  
**Status**: Draft  
**Input**: User description: "The adequate folder for extensions in .pi is in /.pi/agent/extension. Is it possible to change all the codes that is using /.pi/whatsapp-pi to /.pi/agent/extension/whatsapp-pi folder?"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Use New Storage Location (Priority: P1)

As a WhatsApp-Pi user, I want the extension to use the agent extension storage location as its home, so new data is saved in the approved place.

**Why this priority**: This is the core goal of the change and affects every persisted file.

**Independent Test**: Start the extension on a clean setup and verify new files are created only in the new storage location.

**Acceptance Scenarios**:

1. **Given** a clean installation, **When** the extension starts for the first time, **Then** it creates its storage in the new agent extension location.
2. **Given** the extension writes new local data, **When** the operation completes, **Then** the data is stored in the new location and not the legacy location.

---

### User Story 2 - Keep Existing Data Working (Priority: P2)

As an existing user, I want my current local data to remain available after the storage move, so I do not lose access to auth state, settings, recents, or media.

**Why this priority**: Existing users must keep working without manual file moves.

**Independent Test**: Upgrade from a setup with legacy data and confirm the extension loads the same usable state from the new location.

**Acceptance Scenarios**:

1. **Given** legacy data exists in the old location, **When** the extension starts after upgrade, **Then** it loads the existing data from the new storage location without user intervention.
2. **Given** legacy and new data both exist, **When** the extension starts, **Then** it uses the newest valid data and keeps prior content accessible.

---

### User Story 3 - Avoid Manual Migration Steps (Priority: P3)

As a user or maintainer, I want the move to happen automatically, so no one has to copy folders or change settings by hand.

**Why this priority**: Removes friction and reduces support burden.

**Independent Test**: Install or upgrade the extension and verify no manual migration instructions are needed for normal use.

**Acceptance Scenarios**:

1. **Given** an upgrade from the legacy location, **When** the extension starts, **Then** the migration completes automatically if the source data is readable.
2. **Given** a migration cannot complete because storage is unavailable, **When** the extension starts, **Then** it shows a clear failure state instead of silently losing data.

---

### Edge Cases

- Legacy and new storage both exist with different contents.
- Only part of the legacy data is readable.
- New storage location cannot be created due to permissions.
- Legacy storage exists but is empty.
- Upgrade happens while the extension is already running and writing data.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST use the approved agent extension storage location (`~/.pi/agent/extension/whatsapp-pi`) as the default home for all WhatsApp-Pi local persistence.
- **FR-002**: The system MUST read existing user data from the legacy storage location (`~/.pi/whatsapp-pi`) when upgrading from older installs.
- **FR-003**: The system MUST preserve user-authored and user-generated data during the move, including connection state, settings, conversation history, and stored files.
- **FR-004**: The system MUST create the new storage location automatically when it does not already exist.
- **FR-005**: The system MUST keep legacy data available until the new storage copy is usable.
- **FR-006**: The system MUST prevent silent data loss when either storage location is missing, locked, or unreadable.
- **FR-007**: The system MUST not require manual folder copying or configuration changes for normal migration.
- **FR-008**: The system MUST ensure new writes go to the new storage location after migration is complete.

### Key Entities *(include if feature involves data)*

- **Storage Root**: Main local home for extension data and persisted assets.
- **Legacy Data Set**: Existing user data stored in the previous home location.
- **Migrated Data Set**: The same user data after it has been made available in the new storage location.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of new local writes land in the approved storage location after release.
- **SC-002**: 100% of users with readable legacy data can start the extension without manually moving files.
- **SC-003**: 0 normal upgrade paths require folder edits, copying, or other manual migration steps.
- **SC-004**: 100% of preserved local data remains available after successful migration.

## Assumptions

- The approved storage home is `~/.pi/agent/extension/whatsapp-pi`.
- Some users already have data in the legacy `~/.pi/whatsapp-pi` folder.
- Migration happens automatically on startup or first access.
- Local storage is the only concern; no cloud sync or remote backup is introduced.
- If both locations contain valid data, the system prefers the newest usable state and keeps older data recoverable.
