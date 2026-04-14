# Data Model: WhatsApp Recents Menu

## Overview

The feature adds a bounded local recents cache to support the Recents list, conversation actions, and history view.

## Entities

### RecentConversation

Represents a one-to-one conversation shown in the Recents menu.

**Fields**

- `senderNumber`: The WhatsApp number or JID identifier for the conversation partner.
- `senderName` (optional): Display name if available.
- `lastMessagePreview`: Short preview of the most recent message in the conversation.
- `lastMessageTime`: Timestamp of the most recent message.
- `lastMessageDirection`: Whether the latest message was incoming or outgoing.
- `messageCount`: Number of cached messages for this conversation, capped at 20.
- `isAllowed`: Whether the sender is already on the allow list.

**Validation Rules**

- Must represent a single individual conversation.
- Must be unique by sender number.
- Must always have a last message timestamp.
- Must retain only the 20 most recent conversations.

**Relationships**

- Contains many `ConversationMessage` records.
- May correspond to an existing `AllowedNumber` entry.

---

### ConversationMessage

Represents one cached message for a selected conversation.

**Fields**

- `messageId`: Unique message identifier.
- `senderNumber`: Conversation partner number.
- `text`: Message text.
- `direction`: `incoming` or `outgoing`.
- `timestamp`: When the message was sent or received.
- `status` (optional): Delivery state if available.

**Validation Rules**

- Must belong to exactly one recent conversation.
- Must be ordered chronologically within the conversation.
- Must retain only the 20 most recent messages per conversation.

**Relationships**

- Belongs to one `RecentConversation`.

---

### AllowedNumber

Represents a sender that has been added to the allow list.

**Fields**

- `number`: The sender number.
- `name` (optional): Display name if available.

**Validation Rules**

- Must be unique by number.
- Must not be duplicated if the sender is already allowed.

**Relationships**

- Can be created from the Recents action menu.

---

### RecentsStore

Represents the persisted container for recent conversation data.

**Fields**

- `conversations`: Array of `RecentConversation` entries.
- `updatedAt`: Timestamp of the last cache refresh.

**Validation Rules**

- Must not contain more than 20 conversations.
- Must be safe to reload after application restart.

## State Transitions

### RecentConversation

- **Active**: Conversation has at least one cached message and may appear in Recents.
- **Updated**: A new incoming or outgoing message refreshes the preview and timestamp.
- **Trimmed**: The conversation may be removed when the cache exceeds 20 conversations.

### ConversationMessage

- **Stored**: Message is added to the conversation history cache.
- **Trimmed**: Oldest messages are removed when more than 20 are retained.
