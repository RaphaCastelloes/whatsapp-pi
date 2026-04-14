# whatsapp-pi Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-04-14

## Active Technologies
- [e.g., Python 3.11, Swift 5.9, Rust 1.75 or NEEDS CLARIFICATION] + [e.g., FastAPI, UIKit, LLVM or NEEDS CLARIFICATION] (002-manual-whatsapp-connection)
- [if applicable, e.g., PostgreSQL, CoreData, files or N/A] (002-manual-whatsapp-connection)
- Local file-based multi-file auth state (baileys) (002-manual-whatsapp-connection)
- N/A (memory-based queuing) (003-whatsapp-messaging-refactor)
- TypeScript 5.x / Node.js 20+ + `@whiskeysockets/baileys`, `pi-agent-sdk` (004-blocked-numbers-management)
- `config.json` (Local persistent storage in `.pi-data/`) (004-blocked-numbers-management)
- TypeScript 5.x / Node.js 20+ + `@whiskeysockets/baileys`, `pi-agent-sdk`, `pino` (005-verbose-mode-support)
- Memory-based configuration (005-verbose-mode-support)
- TypeScript 5.x / Node.js 20+ + `pi-agent-sdk` (006-auto-connect-flag)
- Memory-based flag detection (`--whatsapp-pi-online`, `--verbose`); depends on existing `.pi-data/` auth state. (006-auto-connect-flag)
- TypeScript 5.x / Node.js 20+ + `@whiskeysockets/baileys` (007-image-recognition)
- Forwarding images as base64 to Pi (007-image-recognition)
- TypeScript 5.x / Node.js 20+ + `@whiskeysockets/baileys`, `pi-agent-sdk` (Extension API) (008-document-message-support)
- Local filesystem persistent storage in `.pi-data/whatsapp/documents/` (008-document-message-support)
- N/A (String constants) (009-localize-system-messages)
- TypeScript 5.x on Node.js 20+ + `@whiskeysockets/baileys`, `pino`, `qrcode-terminal`, existing Pi extension APIs (011-whatsapp-recents)
- Local file-based persistence under the existing user data directory (`~/.pi/whatsapp-pi/`), with a dedicated recents store for conversation summaries and message history (011-whatsapp-recents)

- TypeScript 5.x / Node.js 20+ + `@whiskeysockets/baileys`, `qrcode-terminal`, `pi-agent-sdk` (assumed name for Pi extension API) (001-whatsapp-tui-integration)

## Project Structure

```text
src/
tests/
```

## Commands

npm test; npm run lint

## Code Style

TypeScript 5.x / Node.js 20+: Follow standard conventions

## Recent Changes
- 011-whatsapp-recents: Added TypeScript 5.x on Node.js 20+ + `@whiskeysockets/baileys`, `pino`, `qrcode-terminal`, existing Pi extension APIs
- 009-localize-system-messages: Added TypeScript 5.x / Node.js 20+ + `@whiskeysockets/baileys`, `pi-agent-sdk`, `pino`
- 008-document-message-support: Added TypeScript 5.x / Node.js 20+ + `@whiskeysockets/baileys`, `pi-agent-sdk` (Extension API)


<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
