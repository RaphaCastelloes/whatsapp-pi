# Feature Specification: Remove Passive Reaction Mode

**Feature Branch**: `[033-remove-reaction-mode]`  
**Created**: 2026-05-16  
**Status**: Draft  
**Input**: User description: "Remove the Reaction Mode - Passive - from the Allowed Groups. Remove the logic and the code that is doing this. It is not working well."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Remove Passive Mode Access (Priority: P1)

As a group admin, I no longer see or choose Passive Reaction Mode for allowed groups.

**Why this priority**: Stops users from selecting a mode that is unreliable and intended for removal.

**Independent Test**: Open allowed-group settings and verify Passive Reaction Mode is absent from available choices.

**Acceptance Scenarios**:

1. **Given** an allowed group settings screen, **When** the reaction mode options are shown, **Then** Passive Reaction Mode is not available.
2. **Given** a user tries to assign Passive Reaction Mode, **When** the change is saved, **Then** the system rejects that choice and keeps supported modes only.

---

### User Story 2 - Preserve Existing Group Behavior (Priority: P2)

As a user in an existing group, group reaction handling continues without relying on Passive Reaction Mode.

**Why this priority**: Prevents disruption for groups that already existed before removal.

**Independent Test**: Use a group that previously had Passive Reaction Mode and confirm normal supported behavior continues.

**Acceptance Scenarios**:

1. **Given** a group that previously used Passive Reaction Mode, **When** it is loaded, **Then** it remains usable with supported behavior.
2. **Given** a group with a removed passive setting, **When** reactions occur, **Then** the group follows the default supported reaction behavior.

---

### User Story 3 - Avoid Broken States (Priority: P3)

As a support user, I can trust that old passive-mode references do not break group access or message handling.

**Why this priority**: Reduces errors and support issues caused by legacy configuration.

**Independent Test**: Load records containing Passive Reaction Mode references and confirm the system stays stable and usable.

**Acceptance Scenarios**:

1. **Given** legacy group data contains Passive Reaction Mode, **When** the group is opened, **Then** the system does not fail.
2. **Given** a legacy passive reference exists, **When** a user views group settings, **Then** the unsupported mode is not shown as active.

---

### Edge Cases

- Existing groups still storing Passive Reaction Mode references.
- Users attempting to re-enable Passive Reaction Mode after removal.
- Groups with mixed or outdated reaction settings.
- Loading old data without breaking allowed-group visibility.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST remove Passive Reaction Mode from all allowed-group options.
- **FR-002**: The system MUST prevent users from selecting or saving Passive Reaction Mode for any group.
- **FR-003**: The system MUST treat existing Passive Reaction Mode references as unsupported and use the default supported group behavior instead.
- **FR-004**: The system MUST not depend on Passive Reaction Mode logic for group message or reaction handling.
- **FR-005**: The system MUST keep supported reaction modes available and unchanged.
- **FR-006**: The system MUST not break access to groups that previously used Passive Reaction Mode.

### Key Entities *(include if feature involves data)*

- **Allowed Group**: A group eligible for supported reaction behavior and settings.
- **Reaction Mode Setting**: The group-level choice that determines supported behavior; Passive is no longer valid.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of allowed-group views show no Passive Reaction Mode option.
- **SC-002**: 0 successful saves use Passive Reaction Mode after release.
- **SC-003**: 100% of groups with legacy passive references remain accessible.
- **SC-004**: Support issues tied to Passive Reaction Mode drop to near zero within 30 days of release.

## Assumptions

- Only Passive Reaction Mode is removed; other supported reaction modes remain available.
- Legacy references are kept only to avoid breaking existing groups, not to preserve the removed mode.
- No user-facing migration step is required beyond defaulting to supported behavior.
- No data deletion is required for old passive references.
