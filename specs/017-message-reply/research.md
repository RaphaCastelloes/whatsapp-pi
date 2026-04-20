# Research: Message Detail Reply

## Decision 1: Keep the reply flow inside the existing message detail experience
- **Decision**: Add Reply as an action from the message detail view and open a reply composer from there, rather than introducing a separate reply entry point elsewhere in the app.
- **Rationale**: The selected message is already in context when the user is reading the detail view. Keeping the flow there preserves intent and reduces navigation steps.
- **Alternatives considered**:
  - Adding Reply only from the conversation list: rejected because it weakens the connection to the specific message.
  - Requiring the user to reopen the conversation first: rejected because it adds unnecessary navigation.

## Decision 2: Reuse the current WhatsApp sending path for the reply action
- **Decision**: Use the existing message sending capability to deliver the reply to the same conversation.
- **Rationale**: The project already has a reliable sending path and recents tracking. Reusing it keeps the implementation consistent and avoids duplicating send logic.
- **Alternatives considered**:
  - Building a separate reply-specific sending path: rejected as redundant and higher maintenance.
  - Introducing new storage or backend state for replies: rejected because the selected conversation context is already available.

## Decision 3: Preserve the selected message identity through the reply flow
- **Decision**: Carry the selected message metadata, including conversation identity and message identity, into the reply composer and confirmation flow.
- **Rationale**: The reply must clearly target the selected message’s conversation and remain understandable to the user throughout the flow.
- **Alternatives considered**:
  - Passing only the conversation number: rejected because it weakens message-specific context.
  - Reconstructing the context later from the list: rejected because it is less reliable and harder to test.

## Decision 4: Keep the reply UI simple and cancelable
- **Decision**: The reply composer should be lightweight, allow the user to back out safely, and prevent empty submissions.
- **Rationale**: Replying is a short interaction. Users should be able to compose, cancel, and send without extra steps or risk of accidental sends.
- **Alternatives considered**:
  - Adding threaded reply previews or advanced formatting: rejected for v1 due to scope and complexity.
  - Auto-sending from the detail view without a composer: rejected because it reduces user control.
