# Implementation Plan: Message Detail Reply

**Branch**: `017-message-reply` | **Date**: 2026-04-20 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/017-message-reply/spec.md`

## Summary

Add a Reply action to the message detail view so the user can respond directly to the specific message they are reading. The reply flow will preserve the selected message context, reuse the existing WhatsApp sending path, prevent empty replies, and allow safe cancellation back to the detail view.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20+  
**Primary Dependencies**: `@whiskeysockets/baileys`, `@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui`, `pino`, `qrcode-terminal`  
**Storage**: Existing local recents store at `~/.pi/whatsapp-pi/recents/recents.json`; no new persistent storage  
**Testing**: Vitest (`npm test`) and TypeScript typecheck (`npm run typecheck`)  
**Target Platform**: Terminal-based Pi extension on desktop Node.js  
**Project Type**: Pi extension with terminal UI  
**Performance Goals**: Open the reply flow within 5 seconds and send a valid reply without perceptible delay under normal connection conditions  
**Constraints**: Preserve the selected message context, reuse the current send path, block empty replies, and keep the reply interaction cancelable and simple  
**Scale/Scope**: One message reply flow at a time, launched only from the existing message detail view

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. OOP**: The design uses focused UI classes and small helper methods for composing and sending replies.
- [x] **II. Clean Code**: Names are explicit and responsibilities remain narrowly scoped to reply composition and delivery.
- [x] **III. SOLID**: Reply UI, message context handling, and send logic remain separated by concern.
- [x] **IV. TypeScript**: The plan stays within strict TypeScript patterns and typed message context structures.
- [x] **V. Simplicity**: Reuse the existing detail view and send flow rather than introducing new storage or routing layers.

## Project Structure

### Documentation (this feature)

```text
specs/017-message-reply/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── models/
│   └── whatsapp.types.ts
├── services/
│   ├── whatsapp.service.ts
│   └── recents.service.ts
└── ui/
    └── message-detail.view.ts

tests/
└── unit/
    ├── message-detail.view.test.ts
    └── menu.handler.test.ts
```

**Structure Decision**: Keep the reply flow inside the existing message detail UI and reuse the current WhatsApp service path. The feature will likely add a small reply composer component and lightweight tests beside the existing message detail and menu tests.

## Phase 0: Research Outcome

- Add Reply inside the message detail experience so the user stays in context.
- Reuse the current send message infrastructure to deliver the reply.
- Preserve the selected message identity through the entire reply flow.
- Keep the reply flow simple, cancelable, and safe against empty submissions.

## Phase 1: Design Outcome

- Introduce a reply composer state that carries the selected message context.
- Ensure the reply screen clearly shows what message is being replied to.
- Maintain a return path back to the message detail view when the user cancels.
- Add unit coverage for reply action visibility, context preservation, empty validation, and cancel behavior.

## Complexity Tracking

No constitutional violations identified. No complexity exceptions are required.
