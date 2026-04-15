# Feature Specification: Send WhatsApp Message Tool (JID + Text)

**Feature Branch**: `013-send-wa-message`  
**Created**: 2026-04-15  
**Status**: Draft  
**Input**: User description: "implement a send_wa message only with jid and message"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pi Proactively Sends a WhatsApp Message (Priority: P1)

Pi, acting as an autonomous agent, needs to send a WhatsApp message to a specific contact without waiting for that contact to message first. The agent calls a dedicated tool, providing only the contact's JID and the text content, and the message is delivered via the active WhatsApp connection.

**Why this priority**: This is the core value of the feature — enabling Pi to initiate or respond to conversations programmatically. All other stories depend on this capability existing.

**Independent Test**: Can be fully tested by invoking the tool with a valid JID and a non-empty message while connected, and confirming message delivery to the target contact.

**Acceptance Scenarios**:

1. **Given** Pi is connected to WhatsApp and has a valid session, **When** the `send_wa_message` tool is called with a valid JID and a non-empty message string, **Then** the message is delivered to the target contact on WhatsApp and a success result is returned to Pi.
2. **Given** Pi is not connected to WhatsApp, **When** the `send_wa_message` tool is called, **Then** the tool returns an error result indicating the connection is unavailable and no message is sent.

---

### User Story 2 - Tool Returns Structured Feedback (Priority: P2)

After calling `send_wa_message`, Pi receives structured feedback indicating whether the delivery succeeded or failed, including an error reason on failure so the agent can decide how to proceed (retry, notify user, etc.).

**Why this priority**: Without feedback, Pi cannot distinguish between a silent failure and a successful send, making the integration unreliable for agentic workflows.

**Independent Test**: Can be tested independently by calling the tool and inspecting the returned result object for `success`, `messageId`, and optional `error` fields.

**Acceptance Scenarios**:

1. **Given** a valid JID and message, **When** the tool is invoked and delivery succeeds, **Then** the returned result contains `success: true` and a non-empty `messageId`.
2. **Given** a valid JID and message, **When** delivery fails (e.g., transient network error), **Then** the returned result contains `success: false` and a human-readable `error` description.

---

### User Story 3 - Outgoing Message Recorded in Recents (Priority: P3)

When a message is sent via `send_wa_message`, it is recorded in the recents store so that conversation history remains consistent regardless of whether the send was triggered by an incoming message reply or by the tool directly.

**Why this priority**: This maintains conversation history integrity but does not block the core send capability; it can be implemented after P1 and P2.

**Independent Test**: Can be tested by invoking the tool and then querying the recents service to confirm the outgoing message entry exists for the target contact.

**Acceptance Scenarios**:

1. **Given** the tool sends a message successfully, **When** the recents store is queried for the target JID's conversation, **Then** the sent message appears as an outgoing entry with the correct timestamp and text.

---

### Edge Cases

- What happens when the JID format is invalid (e.g., missing `@s.whatsapp.net` suffix)? The tool must return an error without attempting to send.
- What happens when the message string is empty or whitespace-only? The tool must reject the call and return a validation error before attempting delivery.
- What happens when the WhatsApp socket is temporarily unavailable (reconnecting)? The tool should surface a clear connection-unavailable error rather than silently dropping the message.
- What happens when a group JID (`@g.us`) is provided? Since the existing service blocks group messages on inbound, the tool should document whether group JIDs are in scope (assumed out of scope for v1).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST expose a callable tool named `send_wa_message` that accepts exactly two inputs: a JID (contact identifier) and a message string.
- **FR-002**: The tool MUST validate that the JID is non-empty and the message is non-empty before attempting delivery, returning a descriptive error if either is missing.
- **FR-003**: The tool MUST deliver the message through the active WhatsApp session using the existing sending infrastructure.
- **FR-004**: The tool MUST return a structured result indicating success or failure, including a message identifier on success and an error description on failure.
- **FR-005**: The tool MUST record successfully sent messages in the recents store as outgoing entries with sender number, text, and timestamp.
- **FR-006**: The tool MUST be invocable by Pi independently of any incoming message — it does not require a prior inbound message to establish a target JID.
- **FR-007**: The tool MUST respect the existing connection state; if WhatsApp is not connected, it MUST return an error immediately without hanging.

### Key Entities

- **JID (WhatsApp Contact Identifier)**: A string identifying a WhatsApp contact in the format `<phone_number>@s.whatsapp.net`. It is the primary routing key for message delivery.
- **Message**: A plain-text string containing the content to be sent to the contact identified by the JID.
- **Send Result**: A structured response containing a success flag, an optional message identifier (present on success), an optional error description (present on failure), and the number of delivery attempts made.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A message sent via `send_wa_message` with a valid JID and non-empty text arrives at the target WhatsApp contact within 5 seconds under normal network conditions.
- **SC-002**: 100% of calls with an invalid JID or empty message are rejected before delivery is attempted, with a descriptive error returned to the caller.
- **SC-003**: 100% of successfully sent messages are reflected in the recents store for the corresponding contact within 1 second of confirmed delivery.
- **SC-004**: Calling the tool while WhatsApp is disconnected returns an error result in under 1 second, without blocking the agent.
- **SC-005**: The tool's interface requires exactly two parameters (JID and message), with no additional required configuration, making it immediately usable in any agentic context.

## Assumptions

- The WhatsApp session and connection lifecycle are managed externally; `send_wa_message` consumes the active session but does not manage it.
- Group JID targets (`@g.us`) are out of scope for this feature; only individual contact JIDs (`@s.whatsapp.net`) are supported in v1.
- The existing message sending infrastructure (retry logic, presence indicators, π branding) is reused as-is; this feature adds a new entry point, not a new delivery mechanism.
- The recents service is already initialized before the tool is called; the tool does not need to handle recents initialization.
- The tool is registered as a Pi extension tool (not a user-facing CLI command), consistent with how other extension capabilities are exposed in this project.
