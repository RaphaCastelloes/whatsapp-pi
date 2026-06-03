# whatsapp-pi Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-05-16

## Active Technologies
- TypeScript 5.x / Node.js 20+ + `@whiskeysockets/baileys`, `pino`, `qrcode-terminal` (032-qr-welcome-message)
- `operatorJid` persisted to `~/.pi/whatsapp-pi/config.json` via `SessionManager` on first QR connection (032-qr-welcome-message)
- TypeScript 5.x / Node.js 20+ + `@whiskeysockets/baileys`, `@mariozechner/pi-coding-agent` (ExtensionCommandContext / ui) (030-recents-group-messages)
- No storage changes — grouping is display-only; `recents.json` is unchanged (030-recents-group-messages)

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
- 032-qr-welcome-message: Added TypeScript 5.x / Node.js 20+ + `@whiskeysockets/baileys`, `pino`, `qrcode-terminal`
- 030-recents-group-messages: Added TypeScript 5.x / Node.js 20+ + `@whiskeysockets/baileys`, `@mariozechner/pi-coding-agent` (ExtensionCommandContext / ui)

- 014-whatsapp-service-refactor: Refactor `src/services/whatsapp.service.ts` to separate connection lifecycle, message flow, and status handling while preserving behavior.
- 013-send-wa-message: Added TypeScript 5.x / Node.js 20+ + `@mariozechner/pi-coding-agent` (ExtensionAPI, `registerTool`, TypeBox), `@whiskeysockets/baileys`, `@sinclair/typebox`

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
