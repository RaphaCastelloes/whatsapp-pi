# Implementation Plan: QR Code Display for WhatsApp Connection

**Branch**: `014-qr-code-display` | **Date**: 2025-04-15 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/014-qr-code-display/spec.md`

## Summary

Implement QR code display functionality for WhatsApp connection when using `--whatsapp-pi-online` flag without saved credentials. The system will detect missing authentication state, generate QR codes via Baileys library, display them in terminal with UTF-8 characters, provide user instructions, and handle automatic QR code refresh and connection state transitions.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20+  
**Primary Dependencies**: `@whiskeysockets/baileys`, `qrcode-terminal`, `pi-agent-sdk`  
**Storage**: Local file-based multi-file auth state (baileys) in `~/.pi/whatsapp-pi/auth/`  
**Testing**: Vitest for unit tests, integration tests for WhatsApp flows  
**Target Platform**: Cross-platform CLI (Windows, macOS, Linux)  
**Project Type**: Pi Code Agent extension (CLI tool)  
**Performance Goals**: QR code generation <100ms, connection establishment <2 minutes  
**Constraints**: Terminal UTF-8 support required, network connectivity for WhatsApp pairing  
**Scale/Scope**: Single user per terminal session, lightweight CLI footprint

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. OOP**: Does the design use appropriate classes/interfaces?
  - Uses interfaces for all contracts (IQRCodeDisplay, IQRRenderer, etc.)
  - Extends existing classes (WhatsAppService, SessionManager)
  - Follows object-oriented patterns for QR session management

- [x] **II. Clean Code**: Are names meaningful and functions focused?
  - Clear naming: QRCodeSession, PairingStatus, handleQRCode()
  - Single responsibility: Each interface has focused purpose
  - Self-documenting code with comprehensive type definitions

- [x] **III. SOLID**: Does the design respect SOLID principles?
  - **S**: Each class/interface has single responsibility
  - **O**: Open for extension via interfaces, closed for modification
  - **L**: Substitutable implementations through interface contracts
  - **I**: Segregated interfaces (QR display, rendering, error handling)
  - **D**: Depends on abstractions, not concrete implementations

- [x] **IV. TypeScript**: Is the typing strict and appropriate?
  - Strict typing with interfaces and enums
  - No `any` types used
  - Comprehensive type definitions for all data structures
  - Proper generic usage for event handling

- [x] **V. Simplicity**: Is this the simplest possible implementation?
  - Leverages existing Baileys QR generation
  - Uses standard `qrcode-terminal` library
  - Minimal changes to existing codebase
  - No over-engineering or unnecessary complexity

## Project Structure

### Documentation (this feature)

```text
specs/014-qr-code-display/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── models/
│   └── whatsapp.types.ts    # Existing WhatsApp type definitions
├── services/
│   ├── whatsapp.service.ts  # Main WhatsApp service (MODIFY)
│   ├── session.manager.ts   # Session management (MODIFY)
│   ├── message.sender.ts    # Message sending
│   ├── audio.service.ts     # Audio processing
│   └── recents.service.ts   # Recent messages
└── ui/
    └── menu.handler.ts      # CLI menu handling

tests/
├── unit/
│   ├── whatsapp.service.test.ts
│   ├── session.manager.test.ts
│   ├── send-wa-message.tool.test.ts
│   └── logger.test.ts
└── integration/
    └── [integration test files]

whatsapp-pi.ts              # Main entry point (MODIFY)
package.json                # Dependencies (MODIFY)
```

**Structure Decision**: Single project TypeScript CLI extension. Will extend existing WhatsApp service with QR code display functionality and update session manager to handle QR code generation and display.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
