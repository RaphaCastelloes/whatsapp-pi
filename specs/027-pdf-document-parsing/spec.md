# Feature Specification: PDF Document Parsing

**Feature Branch**: `027-pdf-document-parsing`  
**Created**: 2026-05-11  
**Status**: Draft  
**Input**: User description: "Replace host-dependent PDF text extraction with a local parsing flow that saves the PDF, extracts readable text when possible, includes a bounded preview in the agent message, and falls back gracefully when parsing fails."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read PDF Content (Priority: P1)

As a user, when I receive a PDF document in WhatsApp, I want the system to save the file and include readable text in the message sent to Pi so I can understand the document without opening it manually.

**Why this priority**: This is the main value of the feature and the most common expected flow.

**Independent Test**: Send a text-based PDF and verify the file is saved, the forwarded message includes a preview, and the saved path remains the source of truth.

**Acceptance Scenarios**:

1. **Given** a text-based PDF is received, **When** the document is processed, **Then** the original file is saved and the forwarded message includes a bounded text preview.
2. **Given** a PDF with extractable text is received, **When** processing completes, **Then** the forwarded message identifies the file, size, location, and preview in a readable format.

---

### User Story 2 - Preserve Access When Parsing Fails (Priority: P2)

As a user, when a PDF cannot be read automatically, I want the file still stored and referenced so the document is never lost and I can inspect it later.

**Why this priority**: Reliability matters even when content extraction is unavailable.

**Independent Test**: Send an encrypted, scanned, malformed, or otherwise unsupported PDF and verify the file is still saved and the forwarded message explains that text could not be extracted.

**Acceptance Scenarios**:

1. **Given** a PDF cannot be parsed, **When** it is received, **Then** the file is saved and the forwarded message includes a clear fallback notice.
2. **Given** parsing fails for any reason, **When** processing finishes, **Then** the user still gets a notification with the saved path.

---

### User Story 3 - Keep Other Document Flows Stable (Priority: P3)

As a user, I want non-PDF documents and existing media handling to continue working as before so the new PDF behavior does not disrupt current usage.

**Why this priority**: Prevents regression and protects existing document workflows.

**Independent Test**: Send a non-PDF document and confirm current storage and notification behavior remains unchanged.

**Acceptance Scenarios**:

1. **Given** a non-PDF document is received, **When** it is processed, **Then** existing document handling remains unchanged.
2. **Given** the application starts normally, **When** PDF support is available, **Then** no startup check blocks use of the feature because of missing host utilities.

---

### Edge Cases

- What happens when the PDF is encrypted or password-protected?
- What happens when the PDF contains no extractable text?
- What happens when the PDF is very large?
- What happens when parsing returns partial or low-quality text?
- What happens when parsing fails after the file is already saved?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST save every received PDF document to persistent storage.
- **FR-002**: The system MUST include the saved file path in the message forwarded to Pi.
- **FR-003**: The system MUST attempt to extract readable text from received PDFs.
- **FR-004**: The system MUST include a bounded text preview in the forwarded message when text extraction succeeds.
- **FR-005**: The system MUST preserve the saved file path as the source of truth even when a preview is available.
- **FR-006**: The system MUST continue processing when PDF text extraction fails.
- **FR-007**: The system MUST include a clear fallback notice when PDF text cannot be extracted.
- **FR-008**: The system MUST keep non-PDF document behavior unchanged.
- **FR-009**: The system MUST not prevent startup when host-level PDF utilities are unavailable.
- **FR-010**: The system MUST keep the original PDF available on disk regardless of parsing outcome.
- **FR-011**: The system MUST limit extracted text sent onward so large PDFs do not flood the conversation.
- **FR-012**: The system MUST not require OCR for normal PDF handling.

### Key Entities *(include if feature involves data)*

- **Incoming Document**: A WhatsApp file attachment with name, type, size, and saved location.
- **PDF Preview**: The bounded readable text extracted from a PDF and included in the forwarded message when available.
- **Fallback Notice**: A user-facing notice that explains the file was saved but text extraction was not completed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of received PDFs are saved to disk, even when text extraction fails.
- **SC-002**: At least 90% of text-based PDFs produce a readable preview in the forwarded message.
- **SC-003**: Users can identify the saved file location from the forwarded message in all PDF outcomes.
- **SC-004**: Parsing failures do not block document receipt or notification delivery in normal use.
- **SC-005**: Users do not need to install extra host utilities to use the standard PDF document flow.

## Assumptions

- PDF preview length is bounded to keep messages concise.
- The original file remains the canonical source for later inspection.
- Existing image handling stays unchanged.
- OCR is out of scope for the initial release.
- The feature is intended to improve reliability and clarity, not to alter WhatsApp message routing.
