# Implementation Plan: Refactor WhatsApp message sending

**Branch**: `003-whatsapp-messaging-refactor` | **Date**: 2026-04-10 | **Spec**: [specs/003-whatsapp-messaging-refactor/spec.md](spec.md)
**Input**: Feature specification from `/specs/003-whatsapp-messaging-refactor/spec.md`

## Summary

The feature aims to improve the reliability of WhatsApp message delivery by refactoring the message-sending logic. Currently, the system lacks robust error handling, connection validation, and retry mechanisms. The technical approach involves creating a dedicated `MessageSender` service that handles queuing, connection checks, and retries, separating these concerns from the main `WhatsAppService`.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20+  
**Primary Dependencies**: `@whiskeysockets/baileys`  
**Storage**: N/A (memory-based queuing)  
**Testing**: npm test  
**Target Platform**: Node.js
**Project Type**: Pi Code Agent extension  
**Performance Goals**: Message delivery under 5s, 99% success rate  
**Constraints**: Must adhere to `whatsapp-pi` Constitution (OOP, SOLID, Clean Code)  
**Scale/Scope**: Refactor core messaging method in `WhatsAppService` and introduce `MessageSender`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. OOP**: The design uses a dedicated `MessageSender` class and interfaces.
- [x] **II. Clean Code**: Clear separation of concerns between connection management and messaging.
- [x] **III. SOLID**: `MessageSender` has a single responsibility. `WhatsAppService` is decoupled from retry logic.
- [x] **IV. TypeScript**: Using strict types for requests and results.
- [x] **V. Simplicity**: Memory-based queue is simple and sufficient for the current scale.

## Project Structure

### Documentation (this feature)

```text
specs/003-whatsapp-messaging-refactor/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
src/
├── models/
│   └── whatsapp.types.ts
├── services/
│   ├── session.manager.ts
│   ├── whatsapp.service.ts
│   └── message.sender.ts    # NEW: Dedicated sender service
└── ui/
    └── menu.handler.ts
```

**Structure Decision**: Single project structure (Option 1).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |
