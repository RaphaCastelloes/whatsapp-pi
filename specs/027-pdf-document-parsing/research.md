# Research: PDF Document Parsing

## Decision 1: Use LiteParse for PDF text extraction
- **Decision**: Parse PDFs locally with `@llamaindex/liteparse`.
- **Rationale**: It supports PDF text extraction in-process, accepts `Buffer` input, and avoids host-level Poppler setup.
- **Alternatives considered**: Keep `pdftotext`, add OCR-only flow, or store PDFs without previews.

## Decision 2: Keep original saved file as source of truth
- **Decision**: Always save the uploaded PDF first, then treat the saved path as canonical.
- **Rationale**: Preserves the document even when parsing fails and matches current storage behavior.
- **Alternatives considered**: Inline only extracted text, or replace file-based storage with derived text.

## Decision 3: Use bounded preview text in forwarded message
- **Decision**: Include a short extracted-text preview only when parsing succeeds.
- **Rationale**: Gives Pi enough context without flooding message content.
- **Alternatives considered**: Send full text, send no text, or defer to later manual review.

## Decision 4: Fail open on parser errors
- **Decision**: If parsing fails, still notify Pi with metadata and fallback notice.
- **Rationale**: Document receipt must remain reliable even for scanned, encrypted, or malformed PDFs.
- **Alternatives considered**: Reject the message, retry parsing, or block notification until text is available.

## Decision 5: Remove startup dependency check for `pdftotext`
- **Decision**: Stop checking for `pdftotext` at startup.
- **Rationale**: Host utility is no longer needed for the supported PDF flow.
- **Alternatives considered**: Keep the check as a warning or replace it with another external tool check.

## Decision 6: No OCR in v1
- **Decision**: Disable OCR by default.
- **Rationale**: OCR adds latency and extra operational complexity, and the feature requirement does not need it.
- **Alternatives considered**: Always run OCR, make OCR mandatory, or expose OCR as a startup option.

## Decision 7: Unit-test document outcomes via service boundaries
- **Decision**: Test saved-file behavior, preview success, fallback behavior, and non-PDF behavior with mocked parsing and file I/O.
- **Rationale**: Keeps tests deterministic and aligned with current service-style unit tests.
- **Alternatives considered**: End-to-end WhatsApp tests or manual validation only.
