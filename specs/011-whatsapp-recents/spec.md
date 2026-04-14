# Feature Specification: WhatsApp Recents Menu

**Feature Branch**: `[011-whatsapp-recents]`  
**Created**: 2026-04-14  
**Status**: Draft  
**Input**: User description: "I'd like to create a Recents option in the /whatsapp menu. This option will show the last 20 recents individual conversations. The list item will display the sender, the time and the last message. When the user clicks on the item, it will open another menu with Allow Number, Send Message, History, and Back options. Allow Number will include the sender in the allow list. Send Message will show an input for the user to send a message. History will show the last 20 messages history and a Back menu option."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View Recent Conversations (Priority: P1)

As a user, I want to open a Recents option from the /whatsapp menu so I can quickly review my latest individual conversations.

**Why this priority**: This is the core value of the feature and provides immediate access to recently active conversations.

**Independent Test**: Open the /whatsapp menu and verify that a Recents option is available and shows up to 20 recent individual conversations with the expected details.

**Acceptance Scenarios**:

1. **Given** the user opens the /whatsapp menu, **When** they select Recents, **Then** they see a list of up to 20 individual conversations ordered from most recent to least recent.
2. **Given** a recent conversation is shown, **When** the user views the list item, **Then** they can see the sender, the time of the latest message, and a preview of the last message.

---

### User Story 2 - Manage a Recent Conversation (Priority: P2)

As a user, I want to select a recent conversation and choose what to do next so I can allow the sender or reply directly.

**Why this priority**: Once a conversation is found, the most common follow-up actions are to trust the sender or continue the conversation.

**Independent Test**: Select any conversation from Recents and verify that an action menu appears with Allow Number, Send Message, History, and Back options.

**Acceptance Scenarios**:

1. **Given** the user has selected a recent conversation, **When** the action menu opens, **Then** the menu shows Allow Number, Send Message, History, and Back.
2. **Given** the user chooses Allow Number, **When** the action completes, **Then** the sender is added to the allow list and the user receives confirmation.
3. **Given** the user chooses Send Message, **When** they enter a message and submit it, **Then** the message is sent to the selected sender and the user receives confirmation.

---

### User Story 3 - Review Conversation History (Priority: P3)

As a user, I want to view the recent message history for a selected conversation so I can understand the latest context before responding.

**Why this priority**: History is important for context, but it depends on first opening a conversation from Recents.

**Independent Test**: Select a recent conversation, choose History, and verify that the most recent 20 messages appear with a Back option.

**Acceptance Scenarios**:

1. **Given** the user has selected a recent conversation, **When** they choose History, **Then** they see the last 20 messages in that conversation in chronological order.
2. **Given** the history view is open, **When** the user selects Back, **Then** they return to the conversation action menu.

### Edge Cases

- If there are fewer than 20 recent conversations, the system shows only the available conversations.
- If there are no recent individual conversations, the system shows an empty-state message instead of an empty list.
- If a recent conversation has no message history available, the system still allows the user to go back without error.
- If the sender is already in the allow list, choosing Allow Number does not create a duplicate entry.
- If the user sends an empty message, the system does not send it and prompts the user to enter text.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a Recents option within the /whatsapp menu.
- **FR-002**: The system MUST show up to 20 recent individual conversations when Recents is selected.
- **FR-003**: The system MUST order recent conversations from most recent to least recent.
- **FR-004**: Each recent conversation entry MUST display the sender, the time of the latest message, and a preview of the latest message.
- **FR-005**: Selecting a recent conversation MUST open an action menu with Allow Number, Send Message, History, and Back options.
- **FR-006**: Choosing Allow Number MUST add the sender to the allow list and confirm the action to the user.
- **FR-007**: Choosing Send Message MUST prompt the user to enter a message for the selected sender and confirm when the message is sent.
- **FR-008**: Choosing History MUST show the last 20 messages for the selected conversation.
- **FR-009**: The History view MUST provide a Back option that returns the user to the conversation action menu.
- **FR-010**: The system MUST prevent duplicate allow-list entries when a sender is already allowed.
- **FR-011**: The system MUST handle empty recent-conversation states with a clear message to the user.
- **FR-012**: The system MUST handle empty message submissions by preventing the send action and prompting for valid text.

### Key Entities *(include if feature involves data)*

- **Recent Conversation**: A one-on-one conversation shown in the Recents list, including the sender, latest message time, and latest message preview.
- **Conversation Message**: A message within a selected conversation used for the history view, including message content, direction, and time.
- **Allowed Number**: A sender who has been added to the allow list and is permitted to bypass blocking restrictions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At least 95% of users can locate the Recents option and open it within 10 seconds.
- **SC-002**: At least 90% of users can identify the correct recent conversation from the list using the sender, time, and last message preview.
- **SC-003**: At least 90% of users can complete one of the three primary follow-up actions—allow sender, send a message, or view history—without assistance on the first attempt.
- **SC-004**: The Recents list consistently shows no more than 20 conversations, and the history view consistently shows no more than 20 messages.
- **SC-005**: Users report that the new flow makes it faster to respond to recent conversations compared with navigating through the full conversation list.

## Assumptions

- The Recents option is intended for individual conversations only and excludes group chats.
- Conversation time is shown in the user’s local time and in the same format used elsewhere in the product.
- The allow list already exists and can accept new senders from this flow.
- Sending a message from the action menu is limited to text messages.
- The feature is expected to reuse the existing navigation style used by other /whatsapp menu options.
