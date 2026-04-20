# Feature Specification: WhatsApp Service Refactor

**Feature Branch**: `014-whatsapp-service-refactor`  
**Created**: 2026-04-20  
**Status**: Draft  
**Input**: User description: "Vamos refatorar @src/services/whatsapp.service.ts"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Maintainable WhatsApp Service (Priority: P1)

As a maintainer, I want the WhatsApp service responsibilities to be clearly separated so that connection handling, message sending, message receiving, and status updates are easier to understand and change without breaking unrelated behavior.

**Why this priority**: This is the main reason for the refactor. It reduces risk in future changes and makes the service easier to support.

**Independent Test**: The service can be reviewed and exercised to confirm each major responsibility is handled in a distinct path, with no change in the externally visible behavior of sending, receiving, or connection status.

**Acceptance Scenarios**:

1. **Given** the application is connected and operating normally, **When** a message is received, **Then** the message is handled and recorded as before, without changing user-visible behavior.
2. **Given** the application is connected and operating normally, **When** a message is sent, **Then** it is delivered with the same result information as before.

---

### User Story 2 - Safer Connection Recovery (Priority: P2)

As a maintainer, I want connection loss and session errors to be handled in a more predictable way so that the application recovers when possible and clearly reports when manual action is needed.

**Why this priority**: Connection problems are the most likely source of user disruption, so the refactor must preserve and clarify this behavior.

**Independent Test**: Connection interruptions can be simulated and the resulting status transitions and recovery behavior can be verified independently of other message flows.

**Acceptance Scenarios**:

1. **Given** the connection is closed unexpectedly, **When** recovery is possible, **Then** the service attempts to reconnect and reports the reconnecting state.
2. **Given** the session is invalid or logged out, **When** recovery is not possible automatically, **Then** the service reports a clear disconnected or logged-out state.

---

### User Story 3 - Easier Ongoing Maintenance (Priority: P3)

As a maintainer, I want the service to be easier to test and reason about so that future changes can be made with less effort and lower regression risk.

**Why this priority**: Long-term maintainability is important, but it depends on the core behavioral preservation and connection safety being addressed first.

**Independent Test**: The refactored service can be validated with unit tests that cover the main flows without requiring changes to unrelated areas of the application.

**Acceptance Scenarios**:

1. **Given** the service is exercised through its main flows, **When** tests are run, **Then** the important behaviors are covered without needing to inspect internal state directly.

---

### Edge Cases

- What happens when the service is started while a previous connection is still shutting down? The new start sequence must avoid duplicate active sessions.
- What happens when message recording fails after a message is received? The service must continue processing the message flow and surface the recording failure only as a non-blocking issue.
- What happens when connection recovery loops repeatedly fail? The service must stop retrying after the established recovery policy and report a stable disconnected state.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST preserve the existing externally visible behavior of the WhatsApp service for sending, receiving, presence updates, read acknowledgements, and status reporting.
- **FR-002**: The system MUST separate connection lifecycle handling from message-processing concerns so that each responsibility can be understood and changed independently.
- **FR-003**: The system MUST keep the same user-facing connection states and status messages unless a state change is required to reflect a real session outcome.
- **FR-004**: The system MUST continue to recognize successful connections, disconnections, reconnection attempts, logged-out states, and session errors in a consistent manner.
- **FR-005**: The system MUST prevent duplicate active sessions when a new connection attempt begins while an existing session is still being replaced or shut down.
- **FR-006**: The system MUST continue to record incoming messages and ignore messages according to the existing allow/block rules.
- **FR-007**: The system MUST continue to support outgoing message delivery with the same success and failure reporting as before.
- **FR-008**: The system MUST make the service easier to validate by allowing the main connection and message flows to be tested independently.

### Key Entities

- **WhatsApp Session**: The active connection state used to send and receive messages, including whether it is connected, reconnecting, disconnected, pairing, or logged out.
- **Incoming Message**: A message received from a contact that may be recorded, filtered, or forwarded for further handling.
- **Outgoing Message**: A message sent from the application to a contact, including delivery outcome information.
- **Connection Event**: A session change such as connect, disconnect, reconnect, pair, or logout that affects service status.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The refactored service preserves the existing result of the core send and receive flows in 100% of validated test scenarios.
- **SC-002**: At least 90% of the main connection and message-handling behaviors can be verified through automated tests without requiring manual inspection.
- **SC-003**: A maintainer can identify the responsibility for connection handling, message sending, and incoming message processing in under 2 minutes when reviewing the service design.
- **SC-004**: Connection failures and logged-out states are reported clearly enough that support or maintenance staff can determine the next action without additional debugging in at least 95% of test cases.

## Assumptions

- The refactor is limited to improving the structure and maintainability of the WhatsApp service and does not add new user-facing features.
- Existing behavior that users rely on, including message delivery flow and status updates, remains intact unless a change is necessary to preserve correctness.
- The rest of the application continues to depend on the same service capabilities after the refactor.
- The refactor may introduce internal separation of responsibilities, but those changes must not require users to change how they interact with the application.
