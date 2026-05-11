# Implementation Plan: PDF Document Parsing

**Branch**: `027-pdf-document-parsing` | **Date**: 2026-05-11 | **Spec**: `specs/027-pdf-document-parsing/spec.md`  
**Input**: Feature specification from `/specs/027-pdf-document-parsing/spec.md`

## Summary

Add local PDF parsing for WhatsApp documents with `@llamaindex/liteparse`, keep saving the original file, include a bounded text preview when extraction succeeds, and fall back cleanly when parsing fails. Remove the startup dependency check for `pdftotext`.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20+  
**Primary Dependencies**: `@whiskeysockets/baileys`, `@llamaindex/liteparse`, `pino`, `qrcode-terminal`, `@mariozechner/pi-coding-agent`  
**Storage**: Local filesystem under `.pi-data/whatsapp/documents/`  
**Testing**: Vitest, TypeScript, unit tests with mocked file I/O and parser behavior  
**Target Platform**: Desktop/terminal Pi extension on Windows, macOS, and Linux  
**Project Type**: Pi extension / CLI-integrated agent extension  
**Performance Goals**: Keep PDF processing fast enough to avoid delaying normal message delivery; preview text must stay bounded  
**Constraints**: Save original PDFs before parsing outcomes, no OCR required in v1, no startup dependency on host PDF utilities, preserve existing image handling  
**Scale/Scope**: Single extension package with one document-processing path and unit coverage for PDF/non-PDF outcomes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. OOP**: Design can be expressed with focused services and clear responsibilities.
- [x] **II. Clean Code**: Names and flows stay narrow and readable.
- [x] **III. SOLID**: Document parsing stays isolated from download/storage concerns.
- [x] **IV. TypeScript**: Strong typing will be used for document result shapes and parser outputs.
- [x] **V. Simplicity**: Minimal change set: save, parse, preview, fallback.

## Project Structure

### Documentation (this feature)

```text
specs/027-pdf-document-parsing/
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
├── services/
│   ├── incoming-media.service.ts
│   ├── audio.service.ts
│   ├── recents.service.ts
│   ├── session.manager.ts
│   └── whatsapp.service.ts
└── ui/
    └── menu.handler.ts

tests/
└── unit/
    ├── incoming-media.service.test.ts
    └── whatsapp-pi.extension.test.ts

whatsapp-pi.ts
```

**Structure Decision**: Keep implementation inside `src/services/incoming-media.service.ts` and add/adjust unit tests in `tests/unit/`. No new public contract surface is required.

## Phase 0: Outline & Research

Completed research decisions:
- Use `@llamaindex/liteparse` for local PDF extraction.
- Keep saved PDF path as source of truth.
- Include bounded preview only when extraction succeeds.
- Fail open when parsing fails.
- Remove `pdftotext` startup check.
- Leave OCR disabled by default.

## Phase 1: Design & Contracts

**Data model output**: `data-model.md` defines Incoming Document, PDF Preview, and Fallback Notice.

**Contracts**: No new external contract is required. Existing extension behavior remains internal to the Pi extension runtime.

**Agent context update**: Update Pi agent context to include the new PDF parsing dependency and feature scope.

## Post-Design Constitution Check

- [x] **I. OOP**: Parsing logic can remain isolated behind service-level boundaries.
- [x] **II. Clean Code**: No sprawling responsibilities planned.
- [x] **III. SOLID**: Download/save and parsing concerns remain separable.
- [x] **IV. TypeScript**: Result types will stay explicit.
- [x] **V. Simplicity**: No extra flows beyond save/parse/fallback.

## Complexity Tracking

No constitution violations require justification.
