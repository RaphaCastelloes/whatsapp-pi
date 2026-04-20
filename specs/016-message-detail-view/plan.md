# Implementation Plan: Message Detail View

**Branch**: `016-message-detail-view` | **Date**: 2026-04-20 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/016-message-detail-view/spec.md`

## Summary

Add a dedicated message detail view that opens when a user selects a message from history or a similar message list. The view will show the full message text in a readable, wrapped layout, preserve line breaks and special characters, and let the user return to the previous context. The implementation will reuse existing recents/history data and will use a custom Pi TUI component for the detail screen.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20+  
**Primary Dependencies**: `@whiskeysockets/baileys`, `@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui`, `pino`, `qrcode-terminal`  
**Storage**: Existing local recents store at `~/.pi/whatsapp-pi/recents/recents.json`; no new persistent storage  
**Testing**: Vitest (`npm test`) and TypeScript typecheck (`npm run typecheck`)  
**Target Platform**: Terminal-based Pi extension on desktop Node.js  
**Project Type**: Pi extension with terminal UI  
**Performance Goals**: Open the detail view in under 1 second and render long messages without visible truncation or layout breakage  
**Constraints**: Reuse current menu/navigation flow, preserve message text formatting, avoid extra network calls, and keep the implementation simple  
**Scale/Scope**: One message detail view at a time, opened from existing message-history style lists

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. OOP**: Design uses focused classes and small helper methods for menu flow and message rendering.
- [x] **II. Clean Code**: Names and responsibilities are clear; the feature is additive and narrowly scoped.
- [x] **III. SOLID**: UI rendering, navigation, and stored message data remain separated by responsibility.
- [x] **IV. TypeScript**: Existing strict TypeScript patterns are preserved; new code should remain fully typed.
- [x] **V. Simplicity**: Reuse the current recents/history model and add only the minimum UI needed for message detail.

## Project Structure

### Documentation (this feature)

```text
specs/016-message-detail-view/
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
│   └── whatsapp.types.ts
├── services/
│   ├── recents.service.ts
│   └── whatsapp.service.ts
└── ui/
    └── menu.handler.ts

tests/
└── unit/
    └── menu.handler.test.ts
```

**Structure Decision**: Keep the feature inside the existing TypeScript extension structure. The message detail view belongs in `src/ui/` beside the current menu flow, reuses message history data from `src/services/recents.service.ts`, and is validated through unit tests in `tests/unit/`.

## Phase 0: Research Outcome

- Use a custom Pi TUI component for the detail view so the message can be displayed in a readable multi-line layout.
- Reuse the existing recents/history store as the source of truth for message text and metadata.
- Preserve line breaks and support long text through wrapping instead of truncation.
- Keep navigation simple with a close/back action that returns the user to the originating list.

## Phase 1: Design Outcome

- Add a transient message-detail view state that is derived from a selected message.
- Render the message body with a wrapped, readable layout and a clear header/footer.
- Keep the originating history/list context so the user can return without losing their place.
- Add unit coverage for message selection, long-text rendering behavior, and back-navigation flow.

## Complexity Tracking

No constitutional violations identified. No complexity exceptions are required.
