# Implementation Plan: Migrate Extension Storage Path

**Branch**: `035-storage-path-migration` | **Date**: 2026-06-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/035-storage-path-migration/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Move all WhatsApp-Pi persistent local storage from `~/.pi/whatsapp-pi` to `~/.pi/agent/extension/whatsapp-pi`, while preserving existing user data and keeping normal startup behavior intact. The change should centralize storage-path handling so auth state, config, recents, and logs resolve through one root path with automatic legacy migration.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20+  
**Primary Dependencies**: `@whiskeysockets/baileys`, `pi-agent-sdk`, `pino`, `qrcode-terminal`  
**Storage**: Local filesystem under `~/.pi/agent/extension/whatsapp-pi` with legacy read support from `~/.pi/whatsapp-pi`  
**Testing**: Vitest  
**Target Platform**: Node.js 20+ Pi extension runtime  
**Project Type**: Pi Code Agent extension / CLI-style agent service  
**Performance Goals**: No noticeable startup delay beyond one-time migration; normal file access remains immediate  
**Constraints**: Keep behavior backward-compatible; preserve existing user data; avoid manual migration steps; keep design simple  
**Scale/Scope**: Single-user local storage, multiple data folders under one extension root

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. OOP**: Storage path logic stays behind service boundaries and shared helpers.
- [x] **II. Clean Code**: One canonical storage-root definition; no scattered path literals.
- [x] **III. SOLID**: Separate storage resolution/migration from feature logic.
- [x] **IV. TypeScript**: Strict typing for path and migration state handling.
- [x] **V. Simplicity**: Prefer one storage-root abstraction and direct migration flow.

## Project Structure

### Documentation (this feature)

```text
specs/035-storage-path-migration/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── services/
│   ├── session.manager.ts
│   ├── recents.service.ts
│   ├── whatsapp-pi.logger.ts
│   └── incoming-media.service.ts
├── ui/
│   └── message-detail.view.ts
└── models/
    └── whatsapp.types.ts

tests/
└── unit/
    ├── session.manager.test.ts
    ├── recents.service.test.ts
    └── incoming-media.service.test.ts
```

**Structure Decision**: Centralize storage-root resolution in existing service layer, then update every file-path consumer to read from the new extension home while preserving legacy fallback and migration support.

## Complexity Tracking

No constitution violations. New structure stays within existing service boundaries.
