# Research: Message Detail View

## Decision 1: Use a custom Pi TUI view for the message detail screen
- **Decision**: Implement the message detail experience with `ctx.ui.custom()` and a dedicated component built from `@mariozechner/pi-tui` primitives such as `Container`, `Text`, and `Markdown`.
- **Rationale**: The existing `select()` flow is ideal for menus but not for reading full message content. A custom component supports multi-line rendering, clear layout, and a dedicated close action without adding new application screens.
- **Alternatives considered**:
  - Extending the select list item text: rejected because long messages would still be truncated and hard to read.
  - Using `notify()` for full text: rejected because it is not a dedicated layout and is poor for long content.
  - Adding a new storage-backed reader view: rejected because the full message already exists in recents history and no extra persistence is needed.

## Decision 2: Preserve existing message data and reuse recents history
- **Decision**: Reuse the message records already stored in `RecentsService` and open the detail view from the selected message entry.
- **Rationale**: The feature is a presentation change, not a data-model change. Keeping the same source of truth avoids duplication and reduces maintenance risk.
- **Alternatives considered**:
  - Creating a separate message-detail store: rejected as unnecessary duplication.
  - Fetching message text again from WhatsApp on demand: rejected because it adds latency and depends on network availability.

## Decision 3: Preserve line breaks and support long text with wrapping
- **Decision**: Render the full message text with wrapping and preserve explicit line breaks so the user sees the original message structure as closely as possible.
- **Rationale**: The user request is specifically about seeing all the text in an adequate layout. Preserving formatting is essential for readability, especially for multi-line messages.
- **Alternatives considered**:
  - Collapsing whitespace for display: rejected because it changes the message meaning and readability.
  - Truncating to fit one line: rejected because it hides the content the user came to read.

## Decision 4: Keep navigation simple with a single close/back action
- **Decision**: The detail view should close back to the originating history/list context using a simple key action or back control.
- **Rationale**: Users should be able to inspect a message and return immediately to where they were without extra steps.
- **Alternatives considered**:
  - Adding nested detail submenus: rejected because it increases navigation depth without adding value.
  - Replacing the current menu flow entirely: rejected because it would be a larger change than required.
