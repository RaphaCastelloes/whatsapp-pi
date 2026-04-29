# Quickstart: Audio Service Test Coverage

## Prerequisites

- Node.js 20+
- Project dependencies installed
- Vitest available through the project scripts

## Run validation

1. Execute unit tests:
   ```bash
   npm test
   ```

2. Run TypeScript validation:
   ```bash
   npm run typecheck
   ```

## What to verify

- Successful transcription path returns trimmed text
- Missing output file returns fallback text
- Download or transcription failure returns a clear error string
- Tests do not require real Whisper, real files, or live WhatsApp data

## Suggested implementation target

- Add or expand `tests/unit/audio.service.test.ts`
- Use mocked filesystem, process, and message-download dependencies
- Keep assertions focused on return values and side effects
