# Data Model: Message Detail Reply

## Entities

### Selected Message Context
Represents the message the user is currently reading and replying to.

**Fields**
- `messageId`: Unique identifier for the original message.
- `senderNumber`: Conversation identifier used to route the reply.
- `senderName` (optional): Human-readable sender label.
- `text`: Original message text shown to the user.
- `direction`: Whether the selected message was incoming or outgoing.
- `timestamp`: When the original message was sent or received.

**Validation Rules**
- `messageId` must be present.
- `senderNumber` must identify a valid conversation target.
- `text` may be empty for display fallback purposes, but the reply flow must still identify the target conversation.
- `direction` must be either `incoming` or `outgoing`.

**Relationships**
- One selected message context drives one reply flow.
- The reply flow must preserve this context until the message is sent or canceled.

---

### Reply Draft
Represents the text the user enters before sending a reply.

**Fields**
- `text`: The user-entered reply content.
- `targetMessageId`: The message being replied to.
- `targetConversation`: The conversation the reply will be sent to.

**Validation Rules**
- `text` must not be empty or whitespace-only when sent.
- `targetMessageId` and `targetConversation` must remain available while composing.

**Relationships**
- Associated with one selected message context.
- Becomes a reply message when submitted successfully.

---

### Reply Message
Represents the message sent in response to the selected message.

**Fields**
- `messageId`: Identifier of the sent reply.
- `targetConversation`: Conversation that receives the reply.
- `text`: Final reply content.
- `timestamp`: Time the reply was sent.
- `sourceMessageId`: The original message being replied to.

**Validation Rules**
- `text` must be non-empty.
- `targetConversation` must be available when sending.
- `sourceMessageId` must match the selected message context.

**Relationships**
- Created from a `Reply Draft`.
- Linked back to one `Selected Message Context`.
