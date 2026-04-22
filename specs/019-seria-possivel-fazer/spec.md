# Feature Specification: Recents Ordered by Latest Message

**Feature Branch**: `[019-seria-possivel-fazer]`  
**Created**: 2026-04-21  
**Status**: Draft  
**Input**: User description: "Seria possivel fazer esse Recents ser ordenado por conversas recentes? A ordenação e pela ultima mensagem da conversa. Isso e possivel?"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See conversations ordered by latest activity (Priority: P1)

As a user, I want the Recents list to be ordered by the latest message in each conversation so that the most active conversations appear first.

**Why this priority**: Ordering by latest activity is the core purpose of a recents view and directly affects how quickly users find the conversation they need.

**Independent Test**: Create or update multiple conversations with different last-message times, open Recents, and verify the most recently active conversation appears first.

**Acceptance Scenarios**:

1. **Given** two or more conversations with different latest message times, **When** the user opens Recents, **Then** the conversation with the newest message appears above the others.
2. **Given** a conversation receives a new message, **When** the user opens Recents again, **Then** that conversation moves to the correct position based on its latest message time.
3. **Given** a conversation has older messages but a newer latest message than another conversation, **When** the user opens Recents, **Then** it is ranked higher.

---

### User Story 2 - Keep each conversation represented once (Priority: P2)

As a user, I want each conversation to appear only once in Recents so that the list stays easy to scan and does not repeat the same contact.

**Why this priority**: A recents list is only useful when each conversation is shown as a single entry with its latest activity.

**Independent Test**: Send multiple messages in the same conversation, open Recents, and verify the conversation appears once using its latest message as the sorting reference.

**Acceptance Scenarios**:

1. **Given** multiple messages exist for the same conversation, **When** the user opens Recents, **Then** the conversation appears only once in the list.
2. **Given** the same conversation receives a new message, **When** the user opens Recents again, **Then** the single list entry reflects the newest activity.

---

### User Story 3 - Preserve empty and small-list behavior (Priority: P3)

As a user, I want Recents to remain clear and usable when there are few or no conversations so that the ordering change does not break the empty state.

**Why this priority**: The feature should improve ordering without harming the basic menu experience.

**Independent Test**: Open Recents when there are zero or only a few conversations and verify the empty state or list output remains correct.

**Acceptance Scenarios**:

1. **Given** there are no recent conversations, **When** the user opens Recents, **Then** the empty-state message is shown.
2. **Given** there are fewer than the maximum supported recents, **When** the user opens Recents, **Then** the available conversations are shown in latest-message order.

---

### Edge Cases

- If two conversations share the same latest-message time, the list should remain stable and predictable for the user.
- If a conversation has many older messages and one new message, the new message should determine its position in Recents.
- If a conversation has no usable message history, it should not appear as a recent conversation.
- If the list contains only one conversation, it should still be shown as the first and only item.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Recents list MUST be ordered by the most recent message time for each conversation.
- **FR-002**: The Recents list MUST show the conversation with the newest latest message first.
- **FR-003**: When a conversation receives a newer message, the next time Recents opens it MUST be positioned according to that new latest message time.
- **FR-004**: Each conversation MUST appear only once in the Recents list.
- **FR-005**: The Recents list MUST use the latest message in a conversation as the reference for ordering, not the oldest message.
- **FR-006**: The Recents view MUST preserve its existing empty-state behavior when no conversations are available.

### Key Entities *(include if feature involves data)*

- **Recent Conversation**: A single conversation entry shown in Recents, identified by contact details and represented by its latest message activity.
- **Recent Message**: The most recent message in a conversation, used to determine ordering in the list.
- **Recents List**: The ordered set of conversation entries shown to the user when they open Recents.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: When multiple conversations have different latest-message times, 100% of the time the newest conversation appears first in Recents.
- **SC-002**: After a new message arrives in a conversation, reopening Recents shows that conversation at its updated position on the next open.
- **SC-003**: Users can identify the most active conversation at the top of Recents without needing to inspect more than the first item in at least 90% of test cases.
- **SC-004**: No conversation appears more than once in the Recents list during normal use.

## Assumptions

- The feature applies to the existing Recents conversation list already shown in the app.
- The conversation entry displayed in Recents represents the latest activity for that conversation.
- Existing menu actions and conversation history views remain unchanged.
- Stable ordering is preferred when two conversations have the same latest-message time.
