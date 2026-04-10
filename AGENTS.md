# whatsapp-pi Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-04-10

## Active Technologies
- [e.g., Python 3.11, Swift 5.9, Rust 1.75 or NEEDS CLARIFICATION] + [e.g., FastAPI, UIKit, LLVM or NEEDS CLARIFICATION] (002-manual-whatsapp-connection)
- [if applicable, e.g., PostgreSQL, CoreData, files or N/A] (002-manual-whatsapp-connection)
- Local file-based multi-file auth state (baileys) (002-manual-whatsapp-connection)
- N/A (memory-based queuing) (003-whatsapp-messaging-refactor)
- TypeScript 5.x / Node.js 20+ + `@whiskeysockets/baileys`, `pi-agent-sdk` (004-blocked-numbers-management)
- `config.json` (Local persistent storage in `.pi-data/`) (004-blocked-numbers-management)
- TypeScript 5.x / Node.js 20+ + `@whiskeysockets/baileys`, `pi-agent-sdk`, `pino` (005-verbose-mode-support)
- Memory-based configuration (005-verbose-mode-support)

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
- 005-verbose-mode-support: Added TypeScript 5.x / Node.js 20+ + `@whiskeysockets/baileys`, `pi-agent-sdk`, `pino`
- 004-blocked-numbers-management: Added TypeScript 5.x / Node.js 20+ + `@whiskeysockets/baileys`, `pi-agent-sdk`
- 003-whatsapp-messaging-refactor: Added TypeScript 5.x / Node.js 20+ + `@whiskeysockets/baileys`


<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
