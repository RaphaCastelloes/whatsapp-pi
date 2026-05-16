# Implementation Plan: Remove Passive Reaction Mode

**Branch**: `[033-remove-reaction-mode]` | **Date**: 2026-05-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/033-remove-reaction-mode/spec.md`

## Summary

Remove Passive Reaction Mode from allowed-group settings, ignore legacy passive values, and keep supported group behavior unchanged.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20+  
**Primary Dependencies**: `@whiskeysockets/baileys`, `pi-agent-sdk`, `pino`, `qrcode-terminal`  
**Storage**: Local file-based app state under `~/.pi/whatsapp-pi/`  
**Testing**: Vitest  
**Target Platform**: Node.js WhatsApp companion app / Pi extension runtime  
**Project Type**: desktop-app / CLI-style agent service  
**Performance Goals**: No added delay in allowed-group navigation or message handling  
**Constraints**: Keep changes simple; preserve supported reaction modes; avoid breaking existing allowed groups  
**Scale/Scope**: Single WhatsApp companion app with local persistence and menu-driven group settings

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. OOP**: Design stays within existing service and UI class boundaries.
- [x] **II. Clean Code**: Names and flows stay focused; remove dead branches tied to Passive mode.
- [x] **III. SOLID**: Reaction-mode rules stay behind narrow service methods; UI only presents supported choices.
- [x] **IV. TypeScript**: Keep strict typing for reaction mode values and legacy mapping.
- [x] **V. Simplicity**: Prefer direct removal and default fallback over new abstraction.

## Project Structure

### Documentation (this feature)

```text
specs/033-remove-reaction-mode/
├── plan.md
├── research.md
├── data-model.md
└── quickstart.md
```

### Source Code (repository root)

```text
src/
├── services/
└── ui/

tests/
├── unit/
```

**Structure Decision**: Change only existing service and UI layers plus unit tests. No new runtime modules needed.

## Complexity Tracking

No constitution violations. No extra architecture needed.
