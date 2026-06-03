# Data Model: Migrate Extension Storage Path

## Entities

### StorageRoot
Represents the active local home for WhatsApp-Pi persistence.

**Fields**
- `path`: Canonical directory path used by runtime
- `status`: `active | migrating | unavailable`
- `createdAt`: Timestamp when root became usable
- `source`: `new | legacy | recovered`

**Rules**
- Must point to `~/.pi/agent/extension/whatsapp-pi` when active.
- Must be created automatically if missing.

### LegacyStorageRoot
Represents the old local home used by earlier installs.

**Fields**
- `path`: `~/.pi/whatsapp-pi`
- `hasReadableData`: boolean
- `lastSeenAt`: Timestamp of last successful read

**Rules**
- Read-only during migration.
- Used only as fallback input for upgrade.

### MigratedDataSet
Represents preserved user data after migration.

**Fields**
- `authState`: WhatsApp session files
- `config`: Allowed contacts, groups, ignored numbers, settings
- `recents`: Conversation summaries and message history
- `logs`: Runtime log output

**Rules**
- Existing content must remain available after migration.
- New writes must go to active storage root.

## Relationships
- `StorageRoot` may be initialized from `LegacyStorageRoot`.
- `MigratedDataSet` belongs to exactly one active `StorageRoot`.
- Services resolve paths through `StorageRoot`, not through hardcoded literals.

## State Transitions
- `uninitialized` → `migrating` when legacy data is detected.
- `migrating` → `active` when new root is usable and data is preserved.
- `migrating` → `unavailable` when storage cannot be created or read safely.
- `active` remains stable for normal runtime writes.
