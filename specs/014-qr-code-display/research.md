# Research: QR Code Display for WhatsApp Connection

**Feature**: 014-qr-code-display  
**Date**: 2025-04-15  
**Purpose**: Resolve technical unknowns for QR code implementation

## Research Tasks & Findings

### Task 1: QR Code Generation with Baileys Library

**Research Question**: How does Baileys library handle QR code generation and what are the integration patterns?

**Findings**:
- Baileys provides QR codes through the `connection.update` event with `qr` property
- QR codes are automatically generated when no valid credentials exist
- The QR data is a string that needs to be rendered using a QR code library
- Baileys handles QR code refresh automatically (typically every 60 seconds)

**Decision**: Use Baileys' built-in QR generation with `qrcode-terminal` library for terminal display

**Rationale**: Baileys already handles the complex WhatsApp QR protocol, we just need to render the QR string

**Alternatives considered**: 
- Custom QR generation: Too complex, requires reverse engineering WhatsApp protocol
- External QR service: Adds network dependency and privacy concerns

### Task 2: Terminal QR Code Display Best Practices

**Research Question**: What are the best practices for displaying QR codes in terminal applications?

**Findings**:
- `qrcode-terminal` npm package is the standard for terminal QR display
- Supports UTF-8 characters for better rendering
- Handles small/large terminal windows gracefully
- Provides options for terminal size detection

**Decision**: Use `qrcode-terminal` package for QR rendering

**Rationale**: Widely used, well-maintained, specifically designed for terminal QR display

**Alternatives considered**:
- ASCII art QR codes: Poor quality, hard to scan
- Browser-based QR display: Breaks CLI workflow, adds complexity

### Task 3: WhatsApp Connection State Management

**Research Question**: How should we manage connection states during QR code pairing?

**Findings**:
- Baileys emits connection events: `connecting`, `open`, `close`, `qr`
- QR codes appear during initial connection when no credentials exist
- Connection state transitions: `pairing` → `connected` → `ready`
- Need to handle QR expiration and automatic refresh

**Decision**: Extend existing WhatsApp service with QR state handling

**Rationale**: Leverages existing connection management, maintains consistency

**Alternatives considered**:
- Separate QR service: Adds unnecessary complexity
- State machine library: Overkill for simple state transitions

### Task 4: CLI Integration Patterns

**Research Question**: How should QR code display integrate with the existing CLI flow?

**Findings**:
- Current CLI uses Pi extension framework
- `--whatsapp-pi-online` flag triggers WhatsApp connection
- Need to detect missing credentials and trigger QR flow
- Should provide clear user instructions and status updates

**Decision**: Integrate QR display into existing WhatsApp service start flow

**Rationale**: Minimal changes to existing CLI patterns, consistent user experience

**Alternatives considered**:
- Separate QR command: Confusing user experience
- Standalone QR tool: Duplicates connection logic

### Task 5: Error Handling and Edge Cases

**Research Question**: What error scenarios need to be handled for QR code display?

**Findings**:
- Terminal doesn't support UTF-8: Fallback to ASCII or error message
- Network connectivity loss: Handle connection timeouts gracefully
- QR scanning failures: Provide retry instructions
- Multiple failed attempts: Suggest manual intervention

**Decision**: Implement comprehensive error handling with user-friendly messages

**Rationale**: Ensures robust user experience across different environments

**Alternatives considered**:
- Silent failures: Poor user experience
- Complex retry logic: Over-engineering for edge cases

## Technical Decisions Summary

1. **QR Generation**: Use Baileys' built-in QR generation
2. **QR Display**: Use `qrcode-terminal` package
3. **State Management**: Extend existing WhatsApp service
4. **CLI Integration**: Integrate into existing connection flow
5. **Error Handling**: Comprehensive with user-friendly messages

## Dependencies Required

- `qrcode-terminal`: For terminal QR code rendering
- Existing: `@whiskeysockets/baileys` (already present)
- Existing: `pi-agent-sdk` (already present)

## Implementation Complexity

**Low to Medium**: Primarily integration work with existing WhatsApp service. No major architectural changes required.
