# Feature Specification: Allowed Contacts Rename

**Feature Branch**: `026-allowed-contacts`  
**Created**: 2026-05-11  
**Status**: Draft  
**Input**: User description: "Change the /whatsapp from Allowed Numbers to Allowed Contacts."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Rename Main Menu Entry (Priority: P1)

As a user, I want the `/whatsapp` menu to show `Allowed Contacts` instead of `Allowed Numbers` so that the wording matches what the list contains.

**Why this priority**: This is the primary user-visible change and the first place users will notice the updated terminology.

**Independent Test**: Open `/whatsapp` and verify the menu entry now reads `Allowed Contacts`.

**Acceptance Scenarios**:

1. **Given** the user opens `/whatsapp`, **When** the main menu is displayed, **Then** the allow-list entry is labeled `Allowed Contacts`.
2. **Given** the user selects the allow-list entry, **When** the submenu opens, **Then** the new terminology is still shown consistently.

---

### User Story 2 - Keep Contact Flow Language Consistent (Priority: P2)

As a user, I want every screen in the allow-list flow to use the same `Allowed Contacts` wording so that the feature is easy to understand and does not use mixed terms.

**Why this priority**: Consistent wording reduces confusion across list titles, prompts, confirmations, and empty states.

**Independent Test**: Walk through the allow-list flow and confirm no user-facing text in that flow still says `Allowed Numbers`.

**Acceptance Scenarios**:

1. **Given** the user opens the allow-list screens, **When** they view titles, prompts, and confirmations, **Then** each uses `Allowed Contacts` or equivalent contact-focused wording.
2. **Given** the allow-list is empty, **When** the empty state is shown, **Then** the empty-state message also uses `Allowed Contacts` wording.

### Edge Cases

- The allow-list is empty: the empty-state text still uses `Allowed Contacts`.
- A confirmation dialog references a selected entry: the dialog wording uses `Allowed Contacts`, not `Allowed Numbers`.
- Existing saved contacts remain unchanged: only the visible wording changes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST display `Allowed Contacts` in the main `/whatsapp` menu instead of `Allowed Numbers`.
- **FR-002**: The system MUST use `Allowed Contacts` in the title of the allow-list screen.
- **FR-003**: The system MUST use `Allowed Contacts` wording in allow-list prompts, confirmations, notifications, and empty states.
- **FR-004**: The system MUST preserve the current allow-list behavior and contents while changing only user-facing terminology.
- **FR-005**: The system MUST not show `Allowed Numbers` in any user-facing text within the `/whatsapp` allow-list flow.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of user-facing labels in the `/whatsapp` allow-list flow display `Allowed Contacts` instead of `Allowed Numbers`.
- **SC-002**: Users can identify the allow-list entry in the `/whatsapp` menu on the first attempt in at least 95% of manual verification runs.
- **SC-003**: No acceptance test for the allow-list flow contains the old term `Allowed Numbers` in visible text.
- **SC-004**: Users can complete the standard allow-list navigation flow without encountering mixed terminology in 100% of tested screens.

## Assumptions

- This feature is a terminology update only; allow-list behavior, membership, and permissions stay the same.
- The wording change applies to all user-facing occurrences in the `/whatsapp` allow-list flow.
- Existing contact data does not need migration because only labels change.
