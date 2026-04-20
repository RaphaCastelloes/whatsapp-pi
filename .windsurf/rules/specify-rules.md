# whatsapp-pi Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-04-20

## Active Technologies

- TypeScript 5.x / Node.js 20+ + `@mariozechner/pi-coding-agent` (ExtensionAPI, `registerTool`, TypeBox), `@whiskeysockets/baileys`, `@sinclair/typebox` (013-send-wa-message)

## Project Structure

```text
src/
tests/
```

## Commands

npm test; npm run typecheck

## Code Style

TypeScript 5.x / Node.js 20+: Follow standard conventions

## Recent Changes

- 014-whatsapp-service-refactor: Refactor `src/services/whatsapp.service.ts` to separate connection lifecycle, message flow, and status handling while preserving behavior.
- 013-send-wa-message: Added TypeScript 5.x / Node.js 20+ + `@mariozechner/pi-coding-agent` (ExtensionAPI, `registerTool`, TypeBox), `@whiskeysockets/baileys`, `@sinclair/typebox`

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
