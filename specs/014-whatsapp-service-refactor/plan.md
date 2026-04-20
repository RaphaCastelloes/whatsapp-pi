# Implementation Plan: WhatsApp Service Refactor

**Branch**: `014-whatsapp-service-refactor` | **Date**: 2026-04-20 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/014-whatsapp-service-refactor/spec.md`

## Summary

Refactor `src/services/whatsapp.service.ts` to separate connection lifecycle handling, socket event registration, incoming message processing, and outgoing message orchestration while preserving the current public behavior, status reporting, and test coverage expectations.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20+  
**Primary Dependencies**: `@whiskeysockets/baileys`, `pino`, `vitest`, `qrcode-terminal`, existing Pi extension APIs  
**Storage**: Existing local file-based auth/config state under `.pi-data/` and `~/.pi/whatsapp-pi/`  
**Testing**: Vitest unit tests and TypeScript compiler checks  
**Target Platform**: Pi Code Agent extension running on desktop Node.js  
**Project Type**: Extension/CLI-style service module  
**Performance Goals**: Preserve current message send/receive latency and connection recovery responsiveness; no user-visible slowdown in normal flows  
**Constraints**: Preserve existing external behavior, avoid unnecessary new abstractions, keep the design simple, and remove or reduce unsafe typing in touched code  
**Scale/Scope**: Single-service refactor with adjacent unit tests and no new user-facing features

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. OOP**: The design uses focused classes/helpers and keeps responsibilities separated.
- [x] **II. Clean Code**: The design favors meaningful names, small methods, and readable control flow.
- [x] **III. SOLID**: The refactor reduces the responsibilities of `WhatsAppService` and keeps dependencies focused.
- [x] **IV. TypeScript**: The plan calls for tighter typing in the refactored paths and avoids new `any` usage.
- [x] **V. Simplicity**: The simplest change that preserves behavior is preferred over broad redesign.

## Project Structure

### Documentation (this feature)

```text
specs/014-whatsapp-service-refactor/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── models/
└── services/
    ├── whatsapp.service.ts
    ├── message.sender.ts
    ├── incoming-message.resolver.ts
    ├── incoming-media.service.ts
    ├── recents.service.ts
    └── session.manager.ts

tests/
└── unit/
    ├── whatsapp.service.test.ts
    ├── whatsapp.service.auth-failure.test.ts
    └── whatsapp.service.console-filter.test.ts
```

**Structure Decision**: Keep the refactor localized to the existing service layer and unit tests. Avoid creating a broader package split or new top-level modules unless a smaller helper is clearly justified by the implementation.

## Phase 0: Outline & Research

### Open Questions

No unresolved clarification markers remain in the spec, so Phase 0 can be completed from the existing codebase and specification.

### Research Tasks

1. Confirm the safest way to split WhatsApp connection handling without changing the public API.
2. Validate how message sending, presence updates, and reconnection behavior are currently coupled.
3. Identify the smallest test additions needed to protect the refactor.

### Research Output

- **Decision**: Preserve the current `WhatsAppService` public methods and behavior, then extract internal helpers for socket lifecycle and message handling.
  - **Rationale**: This minimizes regression risk and avoids forcing any caller changes.
  - **Alternatives considered**: Replacing the service with a new facade or changing the external interface. Rejected because the feature is a refactor, not a product change.

- **Decision**: Keep outgoing message delivery routed through the existing sender path rather than introducing a new delivery mechanism.
  - **Rationale**: The sender already centralizes retries, presence changes, and message branding behavior.
  - **Alternatives considered**: Re-implementing message delivery inside `WhatsAppService`. Rejected because it would duplicate behavior and increase risk.

- **Decision**: Preserve incoming message filtering, recording, and allow/block checks as observable behavior while simplifying the control flow around them.
  - **Rationale**: Those behaviors are user-facing and already covered by tests.
  - **Alternatives considered**: Reworking message eligibility rules during the refactor. Rejected because scope is maintainability, not policy changes.

## Phase 1: Design & Contracts

### Data Model

See [data-model.md](./data-model.md) for the refactor entities, field expectations, and state transitions.

### Contracts

No external contracts are required for this refactor because the feature does not add a new public API, endpoint, or CLI surface.

### Quickstart

See [quickstart.md](./quickstart.md) for validation and smoke-test steps.

### Agent Context Update

The current project context already reflects the active TypeScript/Node.js, Baileys, and Pi extension stack. No new technology was introduced, so no agent-context technology update was necessary.

### Re-evaluate Constitution Check

- [x] **I. OOP**: Separation of responsibilities remains aligned with object-oriented design.
- [x] **II. Clean Code**: The design still aims for smaller units and clearer names.
- [x] **III. SOLID**: Responsibility boundaries are improved, especially around `WhatsAppService`.
- [x] **IV. TypeScript**: Refactoring should reduce unsafe typing in the touched paths.
- [x] **V. Simplicity**: The plan avoids unnecessary new layers and keeps the change focused.

## Complexity Tracking

No constitutional violations require special justification for this refactor.
