# Implementation Plan: Audio Service Test Coverage

**Branch**: `[021-increase-unit-test]` | **Date**: 2026-04-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/021-increase-unit-test/spec.md`

## Summary

Increase automated test coverage for `src/services/audio.service.ts` by adding deterministic unit tests for the successful transcription path, empty-output fallback, and failure handling. The work focuses on tests and testability only; production behavior should remain unchanged unless a test exposes an existing defect.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20+  
**Primary Dependencies**: `@whiskeysockets/baileys`, `vitest`, `typescript`, Node built-ins (`fs`, `fs/promises`, `child_process`, `os`, `path`)  
**Storage**: Existing local media directory under `~/.pi/whatsapp-medias`; tests should mock file access and not depend on real files  
**Testing**: `vitest run`, `tsc --noEmit`; add or update unit tests under `tests/unit/`  
**Target Platform**: Pi desktop extension on Node.js 20+  
**Project Type**: Desktop extension / agent integration  
**Performance Goals**: Deterministic unit tests; no real transcription or network dependency  
**Constraints**: Preserve current runtime behavior, isolate side effects with mocks, keep strict TypeScript, avoid introducing new production abstractions unless needed for testability  
**Scale/Scope**: Single service file plus unit tests; no new runtime feature scope

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. OOP**: Existing service class stays intact; tests validate class behavior
- [x] **II. Clean Code**: Tests focus on one behavior each, with clear names and setup
- [x] **III. SOLID**: Coverage work stays isolated to service behavior and test boundaries
- [x] **IV. TypeScript**: Tests use strict typing and typed mocks where practical
- [x] **V. Simplicity**: Smallest change set; prefer mocking over production refactors

## Project Structure

### Documentation (this feature)

```text
specs/021-increase-unit-test/
├── plan.md
├── research.md
├── data-model.md
└── quickstart.md
```

### Source Code (repository root)

```text
src/
├── services/
│   └── audio.service.ts

tests/
└── unit/
    └── audio.service.test.ts
```

**Structure Decision**: Single TypeScript extension project. Feature adds or expands unit coverage around `src/services/audio.service.ts` using `tests/unit/audio.service.test.ts` and mocks for file/process boundaries.

## Complexity Tracking

No constitution violations. No extra complexity required.
