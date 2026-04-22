# Quickstart: Recents Ordered by Latest Message

## Goal
Verify that the Recents list is ordered by the latest message in each conversation.

## Prerequisites
- The app is running with recent conversation activity available
- At least two conversations have different latest message times

## Verification Steps

1. Open the main menu.
2. Open **Recents**.
3. Confirm the conversation with the newest message appears first.
4. Send or receive a new message in a different conversation.
5. Open **Recents** again.
6. Confirm the conversation with the new latest message moves to the top.
7. Confirm each conversation appears only once in the list.

## Expected Result
- The Recents list is ordered by latest conversation activity.
- New activity changes the conversation’s position on the next open.
- The empty-state behavior remains unchanged when no conversations exist.
