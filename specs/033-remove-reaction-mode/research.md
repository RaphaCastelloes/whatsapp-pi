# Research: Remove Passive Reaction Mode

## Decision 1: Remove Passive mode from UI choices
- **Decision**: Allowed-group settings will show only supported reaction modes.
- **Rationale**: Users should not select a mode that is being retired because it behaves poorly.
- **Alternatives considered**: Keep Passive hidden but still selectable through old paths; rejected because it preserves broken behavior.

## Decision 2: Map legacy Passive values to supported behavior
- **Decision**: Existing records with Passive will load as supported default behavior.
- **Rationale**: Prevents breakage for existing groups while removing the bad mode.
- **Alternatives considered**: Reject legacy records or force manual migration; rejected because it adds avoidable disruption.

## Decision 3: Remove Passive-specific branching
- **Decision**: Delete code paths that special-case Passive reaction handling.
- **Rationale**: Smaller surface area, less chance of regressions, cleaner maintenance.
- **Alternatives considered**: Keep Passive branches behind flags; rejected because feature is being removed, not paused.

## Decision 4: Keep supported reaction modes unchanged
- **Decision**: Active and other valid modes remain available and behave as before.
- **Rationale**: Scope stays bounded and user impact stays minimal.
- **Alternatives considered**: Redesign all reaction modes; rejected as out of scope.
