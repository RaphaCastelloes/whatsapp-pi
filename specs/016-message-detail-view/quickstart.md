# Quickstart: Message Detail View

## Purpose
Verify that a user can click a message, read the full text in a dedicated layout, and return to the previous screen.

## Prerequisites
- Existing WhatsApp-Pi feature branch checked out.
- Dependencies installed.
- A recent conversation or message list with at least one message containing multiple lines or long text.

## Validation Steps

1. **Run automated checks**
   ```bash
   npm test
   npm run typecheck
   ```

2. **Start the extension in Pi**
   - Launch Pi with the WhatsApp-Pi extension enabled.
   - Open the `/whatsapp` menu.

3. **Open a recent conversation or message list**
   - Choose a conversation with at least one readable message.
   - Open the message history or message list that contains the target message.

4. **Open the message detail view**
   - Select a message.
   - Confirm the detail view opens.
   - Verify the entire message text is readable.
   - Verify line breaks and paragraph spacing are preserved.

5. **Return to the previous context**
   - Use the close/back action from the detail view.
   - Confirm the previous list or conversation is restored.

## Expected Results
- The selected message opens in a dedicated view.
- Long messages remain readable.
- The user can return to the previous context without losing navigation flow.

## Notes for Testing
- Include at least one message with long text and line breaks.
- Include at least one message with emojis or special characters.
- Confirm empty or unreadable message content shows a clear fallback message instead of a broken screen.
