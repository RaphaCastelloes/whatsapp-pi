# Data Model: PDF Document Parsing

## Incoming Document
Represents a WhatsApp attachment received by the extension.

### Fields
- **fileName**: Original file name shown by WhatsApp.
- **mimeType**: Document MIME type.
- **fileSize**: Reported size of the upload.
- **savedPath**: Final on-disk location of the saved file.
- **caption**: Optional accompanying text.
- **extractionState**: Whether text was extracted successfully or a fallback was used.

### Validation Rules
- PDF documents must always be saved before any preview is produced.
- File names must be sanitized before being written to disk.
- The saved path must remain available regardless of parsing outcome.

## PDF Preview
Represents bounded readable text extracted from a PDF.

### Fields
- **content**: Extracted text sent onward to Pi.
- **truncated**: Indicates the text was limited before forwarding.
- **sourcePath**: File path of the original saved PDF.

### Validation Rules
- Preview content must be limited to a safe length.
- Preview is optional and only present when extraction succeeds.

## Fallback Notice
Represents the message used when a PDF cannot be read automatically.

### Fields
- **reason**: Human-readable explanation that extraction was unavailable.
- **sourcePath**: File path of the saved PDF.
- **metadata**: File name, MIME type, and size information.

### Validation Rules
- Fallback notice must still reference the saved file path.
- Fallback notice must not block delivery of the document notification.

## Relationships
- One **Incoming Document** can produce at most one **PDF Preview**.
- One **Incoming Document** always produces either a **PDF Preview** or a **Fallback Notice**.
