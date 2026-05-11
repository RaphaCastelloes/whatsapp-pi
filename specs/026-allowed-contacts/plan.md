# Implementation Plan: Allowed Contacts Rename

**Branch**: `026-allowed-contacts` | **Date**: 2026-05-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/026-allowed-contacts/spec.md`

## Summary

Rename the `/whatsapp` allow-list terminology from `Allowed Numbers` to `Allowed Contacts` across the menu, prompts, confirmations, and empty states, while preserving existing allow-list behavior and stored contact data.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20+  
**Primary Dependencies**: `@whiskeysockets/baileys`, `@mariozechner/pi-coding-agent`, existing i18n/menu services  
**Storage**: N/A (label-only change; no persistence changes)  
**Testing**: Vitest unit tests and manual `/whatsapp` menu verification  
**Target Platform**: Pi TUI / terminal-based WhatsApp extension  
**Project Type**: desktop-app extension  
**Performance Goals**: Updated labels appear immediately on next menu render  
**Constraints**: No behavior changes, no data migration, no new user flows  
**Scale/Scope**: Single menu flow plus localization strings and related tests

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. OOP**: Design stays within existing classes and helpers; no new architectural complexity needed.
- [x] **II. Clean Code**: Rename focused, clear, and centralized in translation keys and menu labels.
- [x] **III. SOLID**: Change preserves single responsibility of menu and i18n layers.
- [x] **IV. TypeScript**: Existing strict typing remains unchanged; no `any` needed.
- [x] **V. Simplicity**: Smallest possible change: terminology swap only.

## Project Structure

### Documentation (this feature)

```text
specs/026-allowed-contacts/
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
├── i18n.ts
├── ui/
│   └── menu.handler.ts
├── services/
└── models/

tests/
└── unit/
```

**Structure Decision**: Single-project TypeScript extension. Feature touches `src/i18n.ts` and `src/ui/menu.handler.ts`, with unit coverage in `tests/unit/`.

## Complexity Tracking

No constitution violations.
