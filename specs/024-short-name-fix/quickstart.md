# Quickstart: Menu Message Send Reliability

## Verify the feature

1. Run the test suite.
2. Open the WhatsApp menu.
3. Send a message from the menu.
4. Send a message from recents.
5. Send a reply from message detail.
6. Confirm Agent-originated responses include π.
7. Confirm menu-originated responses do not include π.
8. Confirm blank messages are blocked.
9. Confirm successful sends appear in conversation history.

## Expected result

- Menu send no longer fails differently from other send paths.
- User receives clear success/failure feedback.
- Menu sends stay reliable.
- π marks Agent-originated responses only.
- Successful sends appear in conversation history.
