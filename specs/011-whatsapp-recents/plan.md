# Implementation Plan: WhatsApp Recents Menu

**Branch**: `[011-whatsapp-recents]` | **Date**: 2026-04-14 | **Spec**: [`specs/011-whatsapp-recents/spec.md`](spec.md)
**Input**: Feature specification from `/specs/011-whatsapp-recents/spec.md`

## Summary

Add a Recents option to the existing `/whatsapp` menu that shows the last 20 individual conversations with sender, time, and last message preview. Selecting a conversation opens a simple action menu for allowing the sender, sending a message, viewing the last 20 messages in that conversation, or returning back. The implementation will reuse the current menu/navigation style, the existing allow-list workflow, and a local persisted recents cache synchronized from incoming and outgoing messages.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20+  
**Primary Dependencies**: `@whiskeysockets/baileys`, `pino`, `qrcode-terminal`, existing Pi extension APIs  
**Storage**: Local file-based persistence under the existing user data directory (`~/.pi/whatsapp-pi/`), with a dedicated recents store for conversation summaries and message history  
**Testing**: `vitest`, `tsc --noEmit`  
**Target Platform**: Pi extension runtime on desktop/server-class Node.js environments  
**Project Type**: Pi extension / CLI-driven WhatsApp integration  
**Performance Goals**: Open the Recents list and conversation menu within 2 seconds for the common case; keep all lists capped at 20 items  
**Constraints**: Strict TypeScript, no duplicate allow-list entries, preserve existing menu behavior, keep implementation simple and local-first  
**Scale/Scope**: Single-user local extension with one menu surface and bounded recent-message storage

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. OOP**: Does the design use appropriate classes/interfaces?
- [x] **II. Clean Code**: Are names meaningful and functions focused?
- [x] **III. SOLID**: Does the design respect SOLID principles?
- [x] **IV. TypeScript**: Is the typing strict and appropriate?
- [x] **V. Simplicity**: Is this the simplest possible implementation?

## Project Structure

### Documentation (this feature)

```text
specs/011-whatsapp-recents/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── tasks.md                     # Created later by /speckit.tasks
```

### Source Code (repository root)

```text
src/
├── models/
├── services/
└── ui/

tests/
└── unit/
```

**Structure Decision**: Use the existing single-project TypeScript layout already present in the repository. The feature will primarily extend `src/services/`, `src/models/`, and `src/ui/`, with unit coverage in `tests/unit/`.

## Complexity Tracking

No constitution violations identified. No additional complexity justification is required.
