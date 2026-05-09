# Implementation Plan: Menu Message Send Reliability

**Branch**: `[024-short-name-fix]` | **Date**: 2026-05-09 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/024-short-name-fix/spec.md`

**Note**: This plan is aligned with the feature spec and the project constitution.

## Summary

Unify outgoing message sending so menu, reply, and recent-conversation flows use the same reliable send path, with consistent retry behavior, origin-aware message formatting, and outgoing history recording.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20+  
**Primary Dependencies**: `@whiskeysockets/baileys`, `pi-agent-sdk`, `pino`, `qrcode-terminal`  
**Storage**: Local file-based recents/session state under `.pi-data/` and `~/.pi/whatsapp-pi/`  
**Testing**: Vitest  
**Target Platform**: Node.js desktop/CLI extension runtime  
**Project Type**: Pi extension  
**Performance Goals**: Outgoing sends should return a clear success/failure result within a bounded retry window  
**Constraints**: Preserve current history recording; avoid duplicate send logic; apply the π marker only to Agent-originated responses  
**Scale/Scope**: Single feature area across menu, reply, and recents send paths

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. OOP**: Design uses existing service classes and shared orchestration.
- [x] **II. Clean Code**: Names stay meaningful; send flow is centralized.
- [x] **III. SOLID**: Sending concerns are separated from UI concerns.
- [x] **IV. TypeScript**: Types remain strict and aligned with existing contracts.
- [x] **V. Simplicity**: Reuse existing send pipeline instead of adding parallel paths.

## Project Structure

### Documentation (this feature)

```text
specs/024-short-name-fix/
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
├── services/
└── ui/

tests/
└── unit/
```

**Structure Decision**: Keep existing single-project TypeScript extension layout. Implement changes in `src/services`, `src/ui`, and unit tests under `tests/unit`.

## Complexity Tracking

No constitution violations require extra justification.
