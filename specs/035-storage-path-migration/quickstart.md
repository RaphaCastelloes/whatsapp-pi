# Quickstart: Migrate Extension Storage Path

## Goal
Verify WhatsApp-Pi stores local data under the new agent extension home and preserves existing data.

## Setup
1. Start with an install that still has data in `~/.pi/whatsapp-pi`.
2. Ensure `~/.pi/agent/extension/whatsapp-pi` does not exist yet.

## Verify Migration
1. Start the extension.
2. Confirm the new storage root is created.
3. Confirm existing auth, config, recents, and logs are still available.
4. Confirm new writes now appear only under `~/.pi/agent/extension/whatsapp-pi`.

## Verify Clean Install
1. Remove both storage roots.
2. Start the extension.
3. Confirm only the new storage root is created.

## Expected Result
- No manual folder copy required.
- Legacy data remains usable.
- New runtime data uses the new path.
