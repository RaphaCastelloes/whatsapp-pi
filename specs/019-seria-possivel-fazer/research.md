# Research: Recents Ordered by Latest Message

## Decision 1: Order conversations by their latest message time
- **Decision**: The Recents list will be sorted using the most recent message time from each conversation.
- **Rationale**: This matches the user’s expectation for a recents view and ensures the most active conversations rise to the top.
- **Alternatives considered**:
  - Sort by conversation creation time: rejected because it would not reflect current activity.
  - Sort by contact name: rejected because it does not represent recency.

## Decision 2: Keep one entry per conversation
- **Decision**: Each conversation will continue to appear only once in the Recents list, with its latest activity determining its position.
- **Rationale**: Recents should summarize each conversation, not repeat individual messages.
- **Alternatives considered**:
  - Show every message as its own row: rejected because it would make the list noisy and harder to scan.

## Decision 3: Preserve the existing empty-state behavior
- **Decision**: The empty-state message and return flow will remain unchanged when there are no conversations.
- **Rationale**: The ordering improvement should not alter the basic user experience when no data exists.
- **Alternatives considered**:
  - Introduce a new empty state: rejected because there is no user need for a different message.

## Decision 4: No external contracts required
- **Decision**: No contracts directory is needed for this feature.
- **Rationale**: The change stays inside the existing internal menu experience and does not introduce a public interface.
- **Alternatives considered**:
  - Add interface contracts: rejected because there is no external integration boundary.
