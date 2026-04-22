# Data Model: Recents Ordered by Latest Message

## RecentConversation
Represents one conversation entry shown in Recents.

**Fields**
- `senderNumber`: Unique identifier for the conversation
- `senderName`: Optional display name
- `lastMessagePreview`: Short preview of the latest message
- `lastMessageTime`: Timestamp of the most recent message
- `lastMessageDirection`: Direction of the latest message
- `messageCount`: Number of retained messages for the conversation
- `isAllowed`: Whether the conversation is in the allow list

**Validation Rules**
- Must represent only one conversation entry per contact
- Must be ordered by latest message time
- Must always use the latest message as the source of ordering

## RecentMessage
Represents one retained message inside a conversation history.

**Fields**
- `messageId`: Stable message identifier
- `senderNumber`: Parent conversation identifier
- `text`: Message content used for preview and history
- `direction`: Incoming or outgoing
- `timestamp`: Message time used for sorting

**Validation Rules**
- Must belong to exactly one conversation
- Must remain in chronological order within the conversation
- Must not contain empty text

## RecentsList
Represents the ordered collection of recent conversations.

**Fields**
- `conversations`: Ordered list of `RecentConversation` entries
- `updatedAt`: Last refresh time

**Relationships**
- One `RecentsList` contains many `RecentConversation` entries
- One `RecentConversation` is derived from the latest `RecentMessage` in its history
- Multiple `RecentMessage` records can belong to a single `RecentConversation`

## State Rules
- When a new message arrives for a conversation, that conversation becomes eligible to move to the top of Recents.
- When Recents opens, the list is rebuilt from the latest stored conversation data.
- A conversation must not be duplicated in the visible list.
- If two conversations have the same latest-message time, the order should remain stable.
