# Data Model: Menu Message Send Reliability

## Entity: OutgoingMessage
Represents one outgoing message sent by the user.

**Fields**
- recipient: destination contact identifier
- text: message content shown to the recipient
- timestamp: time of send attempt or success
- status: success or failure outcome
- messageId: external message reference when available
- source: menu, reply, recents, or agent
- attempts: number of send attempts

**Validation Rules**
- text must not be blank or whitespace-only
- recipient must identify a valid target
- successful sends must have a recorded history entry

## Entity: SendRule
Represents the shared behavior applied before and during send.

**Fields**
- formatting rule
- retry policy
- error handling rule
- presence-feedback rule
- origin-aware π marker rule

**Validation Rules**
- the same rule set must apply to all send entry points
- π must be applied only when the source is Agent-originated
- formatting must not vary by entry point unless explicitly configured

## Entity: ConversationHistoryEntry
Represents a stored record of a successful outgoing message.

**Fields**
- messageId
- senderNumber
- text
- direction
- timestamp

**Relationships**
- belongs to one conversation history stream
- created only after a successful send
