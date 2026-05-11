# Quickstart: PDF Document Parsing

## Goal
Verify PDFs are saved, parsed when possible, and still handled safely when parsing fails.

## What to check
1. Send a text-based PDF through WhatsApp.
2. Confirm the original file is stored on disk.
3. Confirm the forwarded Pi message includes a short preview.
4. Send an encrypted, scanned, or malformed PDF.
5. Confirm the file is still stored and the message shows a fallback notice.
6. Send a non-PDF document and confirm existing behavior remains unchanged.

## Expected outcomes
- Every PDF is saved.
- Readable PDFs include a bounded text preview.
- Unreadable PDFs still generate a usable notification.
- No host PDF utility is required for normal startup.
