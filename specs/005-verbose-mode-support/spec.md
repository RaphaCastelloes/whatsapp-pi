# Feature Specification: Verbose Mode Support

**Feature Branch**: `005-verbose-mode-support`  
**Created**: 2026-04-10  
**Status**: Draft  
**Input**: User description: "the argument pi -e @whatsapp-pi.ts -v to be a verbose mode. The verbose show the trace data. The not verbose, without -v pi -e @whatsapp-pi.ts, don´t show the trace."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Toggle Verbose Mode (Priority: P1)

As a Software Engineer using the WhatsApp extension, I want to enable verbose logging by adding `-v` to the launch command so that I can troubleshoot connection issues with detailed trace data.

**Why this priority**: High. Essential for debugging the "failed to commit mutations" and "conflict" errors frequently encountered in Baileys.

**Independent Test**: Run `pi -e ./whatsapp-pi.ts -v` and verify that the terminal displays detailed JSON logs from the `@whiskeysockets/baileys` library.

**Acceptance Scenarios**:

1. **Given** the extension is loaded with the `-v` flag, **When** a WhatsApp socket event occurs, **Then** the full trace data is printed to the console.
2. **Given** the extension is loaded without the `-v` flag, **When** the same event occurs, **Then** only high-level status messages are shown.

---

### User Story 2 - Default Quiet Mode (Priority: P2)

As a daily user of the WhatsApp extension, I want the output to be clean and minimal by default so that I am not overwhelmed by technical socket data during my normal workflow.

**Why this priority**: Medium. Improves the general user experience and reduces terminal noise.

**Independent Test**: Run `pi -e ./whatsapp-pi.ts` (without any flags) and verify that only "WhatsApp connection successfully opened" and similar status messages appear.

**Acceptance Scenarios**:

1. **Given** no verbose flag is provided, **When** the Agent connects, **Then** no Baileys trace logs are visible.

### Edge Cases

- **Multiple Flags**: How does the system handle both `-v` and `--verbose`? (Requirement: Both MUST be supported and result in the same behavior).
- **Flag Placement**: Does the flag work if placed before the extension file? (Assumption: The extension only cares if the flag exists in the command context).
- **Runtime Toggle**: Can verbosity be changed without restarting? (Assumption: Out of scope for v1; required only at startup).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST detect the presence of `-v` or `--verbose` flags in the Pi launch arguments.
- **FR-002**: System MUST register the `verbose` flag with the Pi Extension API to ensure proper detection.
- **FR-003**: System MUST dynamically set the Baileys logger level to 'trace' or 'debug' when verbose mode is active.
- **FR-004**: System MUST set the Baileys logger level to 'silent' (or a minimal 'error' level) when verbose mode is inactive.
- **FR-005**: System MUST ensure that internal custom logs (e.g., from `MessageSender`) also respect the verbose state.

### Key Entities

- **Logging Configuration**: A singleton state that stores the detected verbosity level.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Running with `-v` results in 100% of Baileys socket events being logged to the console.
- **SC-002**: Running without `-v` results in 0% of socket "trace" level logs appearing.
- **SC-003**: Flag detection logic completes during the `activate` phase of the extension.

## Assumptions

- The Pi Code Agent correctly propagates command-line arguments to the loaded extension.
- The `pino` logger used by Baileys is configurable at runtime during socket creation.
- Users are familiar with standard CLI flag patterns.
