# Data Model: Remove Passive Reaction Mode

## Entity: AllowedGroup

Represents a WhatsApp group that is eligible for supported group behavior.

### Fields
- **number**: Group JID or identifier.
- **name**: Display name.
- **reactionMode**: Supported mode for the group.

### Validation Rules
- `reactionMode` must be a supported value.
- Legacy Passive values must not remain active after load.
- A group with missing mode data must use the supported default.

### State Notes
- Existing Passive values transition to default supported behavior.
- Supported values remain unchanged.

## Entity: ReactionModeSetting

Represents current group reaction choice.

### Fields
- **value**: Current supported mode.

### Validation Rules
- Passive is invalid.
- Stored values must resolve to supported behavior only.
