# Feature Specification: Menu Message Send Reliability

**Feature Branch**: `[024-short-name-fix]`  
**Created**: 2026-05-09  
**Status**: Draft  
**Input**: User description: "Especificação — Falha no envio de mensagem pelo menu"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reliable menu send (Priority: P1)

As a user, I can send a message from the WhatsApp menu and get a dependable result, even when connection is unstable.

**Why this priority**: This is the main problem reported and the highest-value fix.

**Independent Test**: Open menu, send a message under normal and unstable connection conditions, and confirm the user gets a clear success or failure outcome without the app freezing.

**Acceptance Scenarios**:

1. **Given** the messaging service is available, **When** the user sends a message from the menu, **Then** the message is delivered or a clear failure is reported.
2. **Given** the connection is temporarily unavailable, **When** the user sends a message from the menu, **Then** the system retries and reports the final outcome.

---

### User Story 2 - Distinguish Agent and menu origin (Priority: P2)

As a user, I can tell whether a response came from the Agent or from the menu by the message format used.

**Why this priority**: The system needs a visible origin marker so Agent-driven responses and menu-driven responses can be distinguished.

**Independent Test**: Send one message from the Agent path and one from the menu path, then verify only the Agent-originated response includes the π marker.

**Acceptance Scenarios**:

1. **Given** a response is sent by the Agent, **When** the message is delivered, **Then** the message includes the π marker.
2. **Given** a response is sent from the menu, **When** the message is delivered, **Then** the message does not include the π marker.

---

### User Story 3 - Clear message format and feedback (Priority: P3)

As a user, I can understand exactly what message will be sent and whether it succeeded.

**Why this priority**: Clear feedback reduces mistakes and support requests.

**Independent Test**: Attempt sends with normal text, blank text, and connection failures, then verify the displayed message and outcome are unambiguous.

**Acceptance Scenarios**:

1. **Given** the message is empty, **When** the user tries to send it, **Then** the system blocks the send and asks for valid text.
2. **Given** the send completes, **When** the result is shown, **Then** the user sees a clear success or failure message.

### Edge Cases

- What happens when the connection drops during send?
- How does system handle repeated failed attempts?
- What happens when the user submits blank or whitespace-only text?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST allow users to send a message from the menu.
- **FR-002**: The system MUST distinguish Agent-originated responses from menu-originated responses using a consistent origin marker policy.
- **FR-003**: The system MUST retry a send when the first attempt fails due to temporary unavailability.
- **FR-004**: The system MUST provide a final success or failure result after each send attempt.
- **FR-005**: The system MUST prevent blank or whitespace-only messages from being sent.
- **FR-006**: The system MUST apply the π marker only to Agent-originated responses and must not apply it to menu-originated responses.
- **FR-007**: The system MUST record successful outgoing messages in conversation history.
- **FR-008**: The system MUST present a clear error message when a send cannot be completed.

### Key Entities *(include if feature involves data)*

- **Outgoing Message**: A message the user sends to a contact; includes recipient, text, timestamp, and delivery result.
- **Send Rule**: A consistent rule set that controls formatting, retry behavior, and error handling for outgoing messages.
- **Conversation History Entry**: A saved record of a sent message used to show recent activity.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At least 95% of menu-based sends complete with a clear final result on the first user action.
- **SC-002**: Users can distinguish Agent-originated responses from menu-originated responses in 100% of tested cases using the expected message marker behavior.
- **SC-003**: Blank-message attempts are blocked every time.
- **SC-004**: Users receive a clear success or failure message for every send attempt.
- **SC-005**: Support complaints about menu sending reliability drop by at least 50% after release.

## Assumptions

- Users may be offline or temporarily disconnected when attempting to send.
- Existing conversation history should remain available for successful outgoing messages.
- Scope is limited to message sending behavior; message receiving is out of scope.
- The π marker is a deliberate origin indicator: Agent-originated responses include it, menu-originated responses do not.
