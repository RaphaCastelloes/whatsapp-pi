# Quickstart: WhatsApp Recents Menu

## Purpose

Verify the Recents menu flow for individual conversations, including allow-list updates, message sending, and message history browsing.

## Prerequisites

- The project dependencies are installed.
- A WhatsApp session is already authenticated.
- The extension is running in the Pi environment.

## Manual Verification Flow

1. Open the `/whatsapp` menu.
2. Select **Recents**.
3. Confirm that up to 20 recent individual conversations appear.
4. Open one conversation entry.
5. Confirm the action menu shows:
   - **Allow Number**
   - **Send Message**
   - **History**
   - **Back**
6. Choose **Allow Number** and confirm the sender is added to the allow list.
7. Choose **Send Message**, enter text, and confirm the message is sent.
8. Choose **History** and confirm that the last 20 messages are shown.
9. Use **Back** to return to the action menu.

## Validation Checks

- Recents should never show more than 20 conversations.
- History should never show more than 20 messages.
- Duplicate allow-list entries should not be created.
- Empty message submission should be rejected with a user-facing prompt.

## Recommended Tests

- Run the unit test suite.
- Run TypeScript type-checking.
- Confirm the existing allow/block menu flows still work after the feature is added.
