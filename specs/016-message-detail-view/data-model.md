# Data Model: Message Detail View

## Entities

### Message
Represents a single WhatsApp message available for reading in the detail view.

**Fields**
- `messageId`: Unique identifier for the message.
- `senderNumber`: Contact identifier used to group messages by conversation.
- `senderName` (optional): Display name shown to the user when available.
- `text`: Full message text as stored in recents/history.
- `direction`: Whether the message was incoming or outgoing.
- `timestamp`: When the message was created or received.

**Validation Rules**
- `messageId` must be present.
- `senderNumber` must be present.
- `text` may be empty in storage, but the detail view must handle that case with a clear empty-state message.
- `direction` must be either `incoming` or `outgoing`.
- `timestamp` must be a valid time value.

**Relationships**
- A conversation contains many messages.
- A message detail view is created from exactly one selected message.

---

### Message Detail View State
Represents the transient UI state used to render a selected message in a dedicated layout.

**Fields**
- `messageId`: The selected message being displayed.
- `title`: The visible title for the detail view.
- `displayName` (optional): Sender label shown in the header.
- `fullText`: The body rendered in the detail layout.
- `direction`: Used to label sent vs received context if shown.
- `timestamp`: Used for display context.
- `origin`: The previous screen or list the user will return to.

**Validation Rules**
- `fullText` must be shown in full when text exists.
- The view must preserve explicit line breaks.
- Long text must remain readable through wrapping or scrolling.
- The state must always keep enough information to return to the originating view.

**Relationships**
- Created from a `Message` selection.
- Disposed when the user closes the detail view.

---

### Previous Context
Represents the originating conversation or list view that opened the detail screen.

**Fields**
- `contextType`: The source screen type, such as history or conversation list.
- `senderNumber` (optional): The conversation associated with the message.
- `selectionIndex` (optional): The item position to restore if the user returns.

**Validation Rules**
- The context must be sufficient to return the user to the same location or closest available equivalent.

**Relationships**
- Linked to one message detail view session.
- Not persisted separately; it exists only during navigation.
