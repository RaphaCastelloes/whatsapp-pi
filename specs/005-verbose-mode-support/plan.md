# Implementation Plan: Verbose Mode Support

**Branch**: `005-verbose-mode-support` | **Date**: 2026-04-10 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/005-verbose-mode-support/spec.md`

## Summary

Implement a verbose logging mode triggered by the `-v` or `--verbose` command-line flags. This will allow developers to toggle between a clean terminal output and a detailed trace of the WhatsApp socket activity (via Baileys) without changing the codebase.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20+
**Primary Dependencies**: `@whiskeysockets/baileys`, `pi-agent-sdk`, `pino`
**Storage**: Memory-based configuration
**Testing**: Manual verification using `pi -e ./whatsapp-pi.ts -v`
**Target Platform**: Pi Code Agent CLI
**Project Type**: Pi Code Agent Extension
**Performance Goals**: Instant flag detection at startup; no performance impact in non-verbose mode.
**Constraints**: MUST use the Pi Extension API for flag registration (`pi.registerFlag`).
**Scale/Scope**: Extension-wide logging toggle.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. OOP**: Will update `WhatsAppService` to accept a verbosity parameter in its constructor or `start` method.
- [x] **II. Clean Code**: Use constant for log levels; encapsulate flag logic.
- [x] **III. SOLID**: Separate CLI argument parsing from the core WhatsApp connection service.
- [x] **IV. TypeScript**: Typed flag results and log level mappings.
- [x] **V. Simplicity**: Minimal implementation using existing library capabilities (Pino).

## Project Structure

### Documentation (this feature)

```text
specs/005-verbose-mode-support/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
whatsapp-pi.ts           # Update for flag registration and detection
src/
└── services/
    └── whatsapp.service.ts   # Update to handle dynamic logger levels
```

**Structure Decision**: Continuous improvement of existing modular structure.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |
