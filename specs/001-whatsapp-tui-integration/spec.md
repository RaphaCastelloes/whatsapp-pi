# Feature Specification: WhatsApp TUI Integration

**Feature Branch**: `001-whatsapp-tui-integration`  
**Created**: 2026-04-09  
**Status**: Draft  
**Input**: User description: "in Pi TUI, when I set /whatsapp it opens a menu with Login, Connect, Disconnect, Logoff. When user select Login, it show the QR code to sincronize. When select Connect, it allow the Agent to answer the message comming from socket. When select Disconnect, it block the Agent to anser the message comming from socket. Logoff delete the credentials. Allow Numbers, show the list of numbers that will be considered by the messager receiver."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Initial Setup & Pairing (Priority: P1)

As a Software Engineer using Pi TUI, I want to connect my WhatsApp account so that the AI Agent can assist me with messages directly from my terminal.

**Why this priority**: High. This is the foundational step for the entire integration. Without pairing, no other feature works.

**Independent Test**: Can be fully tested by running `/whatsapp`, selecting Login, and successfully scanning the QR code with a mobile device.

**Acceptance Scenarios**:

1. **Given** the user is logged out, **When** they run `/whatsapp` and select "Login", **Then** a QR code is displayed in the TUI.
2. **Given** a QR code is displayed, **When** the user scans it with their WhatsApp app, **Then** the session is established and a success message is shown.

---

### User Story 2 - Message Handling Control (Priority: P2)

As a user, I want to enable or disable the AI Agent's response capability so that I can control when it interacts with my contacts.

**Why this priority**: Medium. Provides essential privacy and workflow control.

**Independent Test**: Toggle Connect/Disconnect and verify if the Agent replies to incoming messages from a test number.

**Acceptance Scenarios**:

1. **Given** a paired session, **When** the user selects "Connect", **Then** the Agent begins processing and answering incoming messages from allowed numbers.
2. **Given** the Agent is connected, **When** the user selects "Disconnect", **Then** the Agent stops answering messages but remains paired.

---

### User Story 3 - Recipient Filtering (Priority: P2)

As a user, I want to specify which phone numbers the Agent should interact with so that it doesn't accidentally reply to unauthorized contacts.

**Why this priority**: Medium. Crucial for security and avoiding spam/unintended interactions.

**Independent Test**: Add a specific number to the "Allow Numbers" list and verify that only messages from that number trigger an Agent response.

**Acceptance Scenarios**:

1. **Given** the "Allow Numbers" menu, **When** a user adds a number, **Then** that number is saved to the whitelist.
2. **Given** a message from a number NOT in the allow list, **When** the Agent is connected, **Then** the Agent ignores the message.

---

### User Story 4 - Session Management (Priority: P3)

As a user, I want to be able to log off and delete my credentials from the system for security purposes.

**Why this priority**: Low (compared to pairing/connecting), but necessary for security.

**Independent Test**: Select "Logoff" and verify that the next attempt to use WhatsApp requires a new login/QR scan.

**Acceptance Scenarios**:

1. **Given** an active session, **When** the user selects "Logoff", **Then** local credentials are deleted and the connection is terminated.

### Edge Cases

- **Connectivity Loss**: What happens if the internet connection is lost during an active session? (Assumption: System attempts to reconnect automatically).
- **Invalid Number Entry**: How does the system handle an incorrectly formatted phone number in the "Allow List"? (Assumption: System validates format before saving).
- **Multiple QR Scan Attempts**: What happens if a QR code expires before scanning? (Assumption: A new QR code is generated and displayed automatically).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display a dedicated WhatsApp management menu when the `/whatsapp` command is executed.
- **FR-002**: System MUST generate and render a QR code as ANSI blocks directly in the TUI for authentication.
- **FR-003**: System MUST provide "Connect" and "Disconnect" states to control message interception logic.
- **FR-004**: System MUST allow users to manage a list of "Allowed Numbers" via the TUI.
- **FR-005**: System MUST persist session credentials securely until "Logoff" is selected.
- **FR-006**: System MUST delete all local authentication data upon "Logoff".

### Key Entities

- **WhatsApp Session**: Represents the active connection, including credentials and socket status.
- **Allow List**: A collection of phone numbers (strings) authorized for Agent interaction.
- **Incoming Message**: Data received from the WhatsApp socket to be evaluated against the Allow List and Connection status.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can successfully pair their account in a single attempt 95% of the time.
- **SC-002**: Message filtering based on "Allow List" MUST have 100% accuracy.
- **SC-003**: Logoff MUST result in complete removal of sensitive authentication tokens from the local environment.
- **SC-004**: TUI menu response time for switching between Connect/Disconnect MUST be under 500ms.

## Assumptions

- Users have a mobile device with WhatsApp installed and a working camera for scanning.
- The terminal supports the necessary character set/encoding if QR is rendered in-place.
- Phone numbers in the "Allow List" are provided in international E.164 format.
- The underlying communication layer is used to manage the socket.
