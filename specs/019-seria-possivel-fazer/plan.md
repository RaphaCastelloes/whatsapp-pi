# Implementation Plan: Recents Ordered by Latest Message

**Branch**: `[019-seria-possivel-fazer]` | **Date**: 2026-04-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/019-seria-possivel-fazer/spec.md`

**Note**: This plan is aligned with the feature specification and the repository constitution. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Ensure the Recents list is ordered by the latest message in each conversation so the most active conversation appears first, while preserving the one-entry-per-conversation behavior and the existing empty state.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20+  
**Primary Dependencies**: `@whiskeysockets/baileys`, `@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui`, `pino`, `qrcode-terminal`  
**Storage**: Local file-based recents store under `~/.pi/whatsapp-pi/recents/recents.json`  
**Testing**: Vitest unit tests (`npm test`) and linting when available  
**Target Platform**: Node.js-based Pi extension running on the user’s local machine  
**Project Type**: Desktop-extension / local agent integration  
**Performance Goals**: Recents should reflect the newest message ordering immediately when opened  
**Constraints**: Keep the change simple, preserve existing menus, and avoid introducing duplicate conversation rows  
**Scale/Scope**: Single-user local workspace with a small persistent recents data set

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. OOP**: The current service/UI split remains appropriate for this change.
- [x] **II. Clean Code**: The work is focused on the recents ordering logic and keeps names meaningful.
- [x] **III. SOLID**: The change stays within the existing recents responsibility boundaries.
- [x] **IV. TypeScript**: The implementation will keep strong typing in the current codebase.
- [x] **V. Simplicity**: This is a straightforward ordering adjustment, not a redesign.

## Project Structure

### Documentation (this feature)

```text
specs/019-seria-possivel-fazer/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
src/
├── models/
├── services/
│   └── recents.service.ts
├── ui/
│   └── menu.handler.ts
└── ...

tests/
└── unit/
    ├── recents.service.test.ts
    └── menu.handler.test.ts
```

**Structure Decision**: This feature stays within the existing single-project TypeScript layout under `src/` and `tests/`. The main work is expected in `src/services/recents.service.ts` with coverage in `tests/unit/recents.service.test.ts`.

## Complexity Tracking

No constitution violations were identified, so no complexity exceptions are required.
