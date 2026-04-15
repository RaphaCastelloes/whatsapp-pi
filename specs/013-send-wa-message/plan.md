# Implementation Plan: Send WhatsApp Message Tool (JID + Text)

**Branch**: `013-send-wa-message` | **Date**: 2026-04-15 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/013-send-wa-message/spec.md`

## Summary

Register a `send_wa_message` LLM-callable tool in the Pi extension that accepts a `jid` and a `message` string, delivers the message through the existing `WhatsAppService.sendMessage()` pipeline, records it in `RecentsService`, and returns a structured JSON result to the agent. No new services are introduced — this is purely a new entry point into existing infrastructure.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20+  
**Primary Dependencies**: `@mariozechner/pi-coding-agent` (ExtensionAPI, `registerTool`, TypeBox), `@whiskeysockets/baileys`, `@sinclair/typebox`  
**Storage**: N/A — no new storage; reuses existing recents store  
**Testing**: vitest (existing test runner)  
**Target Platform**: Node.js 20+ (Pi extension runtime)  
**Project Type**: Pi extension (library consumed by Pi agent)  
**Performance Goals**: Message delivery within 5 seconds under normal conditions (inherited from existing `MessageSender`)  
**Constraints**: Tool must return in <1 second when WhatsApp is disconnected (no blocking wait); TypeBox schema required for LLM parameter validation  
**Scale/Scope**: Single tool registration; ~30–50 lines of new code in `whatsapp-pi.ts`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. OOP**: No new classes needed; tool is a thin coordinator delegating to `WhatsAppService` and `RecentsService` — consistent with SRP.
- [x] **II. Clean Code**: `send_wa_message` name is precise; the `execute` function will have one responsibility (validate → send → record → return).
- [x] **III. SOLID**: Open/Closed — existing services unchanged; new entry point added without modifying them. Dependency Inversion — tool receives services via closure, not hard-coded instantiation.
- [x] **IV. TypeScript**: TypeBox `Type.Object` with `Type.String()` fields; `execute` return typed as `Promise<AgentToolResult>`; no `any` introduced.
- [x] **V. Simplicity**: ~30–50 lines of new code; no new files, no new services, no new abstractions.

## Project Structure

### Documentation (this feature)

```text
specs/013-send-wa-message/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── send-wa-message-tool.md
└── tasks.md             # Phase 2 output (/speckit.tasks - NOT created here)
```

### Source Code (repository root)

```text
whatsapp-pi.ts           # +registerTool("send_wa_message", ...) call added here

tests/
└── unit/
    └── send-wa-message.tool.test.ts   # new unit tests
```

**Structure Decision**: Single-project layout. The tool is registered in the existing `whatsapp-pi.ts` extension factory alongside `registerCommand` and `registerFlag`. No new source files are required for the feature itself; only a new test file is added.

## Complexity Tracking

> No constitution violations — no entries required.
