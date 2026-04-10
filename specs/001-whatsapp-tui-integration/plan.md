# Implementation Plan: WhatsApp TUI Integration

**Branch**: `001-whatsapp-tui-integration` | **Date**: 2026-04-09 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/001-whatsapp-tui-integration/spec.md`

## Summary

Implement a WhatsApp integration for Pi Code Agent that allows users to pair their account via QR code in the TUI, toggle message processing (Connect/Disconnect), and manage an allow list of phone numbers.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20+
**Primary Dependencies**: `@whiskeysockets/baileys`, `qrcode-terminal`, `pi-agent-sdk` (assumed name for Pi extension API)
**Storage**: Local JSON files for credentials and allow list (stored in `.pi/extensions/whatsapp/`)
**Testing**: Jest
**Target Platform**: Pi Code Agent TUI
**Project Type**: Pi Code Agent Extension
**Performance Goals**: <500ms for UI state changes; Real-time message interception.
**Constraints**: QR code MUST be rendered as ANSI blocks in TUI.
**Scale/Scope**: Single user session; Limited by Baileys/WhatsApp multi-device limitations.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. OOP**: Will use classes for `WhatsAppService`, `SessionManager`, and `MenuHandler`.
- [x] **II. Clean Code**: Will follow naming conventions and single-responsibility functions.
- [x] **III. SOLID**: `MessageHandler` will be independent of the TUI logic via events or interfaces.
- [x] **IV. TypeScript**: Strict typing enabled; interfaces for all entity definitions.
- [x] **V. Simplicity**: Direct use of Baileys socket events; simple file-based storage.

## Project Structure

### Documentation (this feature)

```text
specs/001-whatsapp-tui-integration/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
src/
├── services/
│   ├── whatsapp.service.ts
│   └── session.manager.ts
├── ui/
│   └── menu.handler.ts
├── models/
│   └── whatsapp.types.ts
└── index.ts
tests/
├── unit/
└── integration/
```

**Structure Decision**: Single project structure as it's a focused extension.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |
