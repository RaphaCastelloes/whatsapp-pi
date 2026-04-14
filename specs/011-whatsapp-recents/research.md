# Research: WhatsApp Recents Menu

## Decision 1: Build Recents from a local persisted cache

- **Decision**: Maintain a local cache of recent individual conversations and their message history, refreshed from incoming/outgoing message activity and initial history sync data.
- **Rationale**: The feature needs a fast, bounded list of the last 20 conversations and the last 20 messages per conversation. A local cache keeps the menu responsive and avoids depending on a live history fetch each time the user opens Recents.
- **Alternatives considered**:
  - Fetch recent chats on demand from WhatsApp every time the menu opens.
  - Rely only on the existing allow/block lists.
  - Store history in an external database.
- **Why not chosen**: On-demand retrieval adds latency and complexity; allow/block lists do not contain the required conversation detail; an external database would be unnecessary for a local single-user extension.

## Decision 2: Use Baileys history sync as a source, not the primary retrieval path

- **Decision**: Use Baileys history-sync events to seed and refresh local conversation data, but do not require a remote history query for normal menu usage.
- **Rationale**: Baileys provides history-sync data through the `messaging-history.set` event, which is suitable for building a local record. The docs also note that message history should be stored locally for later reuse.
- **Alternatives considered**:
  - Depend on `fetchMessageHistory` for all historical lookups.
  - Ignore history sync and only track new messages.
- **Why not chosen**: `fetchMessageHistory` is more complex and less necessary for this bounded feature; ignoring history sync would reduce the usefulness of the history view after restarts.

## Decision 3: Reuse the existing allow-list workflow for "Allow Number"

- **Decision**: Wire the new Allow Number action to the existing allow-list persistence and duplicate prevention logic.
- **Rationale**: The current session manager already supports adding numbers, removing duplicates, and saving configuration. Reusing that workflow keeps the feature consistent and minimizes risk.
- **Alternatives considered**:
  - Create a separate allow-list subsystem.
  - Prompt the user to manually add a number in a new format.
- **Why not chosen**: Separate logic would duplicate behavior and increase maintenance cost; manual entry adds friction and does not fit the selected conversation flow.

## Decision 4: Keep the UI flow nested and menu-driven

- **Decision**: Implement Recents as nested menu interactions: Recents list → conversation actions → history view or send-message input.
- **Rationale**: The repository already uses this interaction model for allowed and blocked numbers. Reusing the same UX pattern keeps the feature familiar and easy to test.
- **Alternatives considered**:
  - A dedicated screen with custom navigation state.
  - Inline command parsing for each action.
- **Why not chosen**: Both alternatives add unnecessary UI complexity for a simple bounded workflow.

## Decision 5: Persist recent conversations in a dedicated file under the existing user data directory

- **Decision**: Store the recents cache in a dedicated local file under the same user-specific data directory used by the current session manager.
- **Rationale**: Separation from the general config file keeps message history isolated from settings while still remaining simple and local.
- **Alternatives considered**:
  - Add recents data directly into the existing config file.
  - Use in-memory storage only.
- **Why not chosen**: Embedding history in the config file mixes unrelated concerns; in-memory storage would lose recents on restart.

## Decision 6: Limit the feature to individual conversations and text messages

- **Decision**: Show only one-to-one conversations in Recents and support text message sending from the action menu.
- **Rationale**: This matches the feature request and keeps the scope tightly bounded.
- **Alternatives considered**:
  - Include group chats.
  - Support attachments and rich message types.
- **Why not chosen**: Both would significantly expand scope without improving the primary user journey.

## Decision 7: Cap both displayed lists at 20 items

- **Decision**: Show at most 20 recent conversations and at most 20 messages in the history view.
- **Rationale**: This is explicitly requested and keeps the menus fast and easy to scan.
- **Alternatives considered**:
  - Unlimited history display.
  - User-configurable list size.
- **Why not chosen**: Unlimited history is harder to scan and more expensive to maintain; configurability is unnecessary for the first version.

## Research Notes

- Baileys history sync is delivered through `messaging-history.set`, and the docs recommend storing messages locally for later use.
- The existing codebase already manages allow/block lists and uses nested menus, which supports a minimal implementation approach.
