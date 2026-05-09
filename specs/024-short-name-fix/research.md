# Research: Menu Message Send Reliability

## Decision 1: Use one shared outgoing send path
- **Decision**: Route menu, reply, and recents sends through one shared send orchestration path.
- **Rationale**: Prevents behavior drift, keeps retries and error handling consistent, and avoids duplicated send logic.
- **Alternatives considered**:
  - Keep menu on direct socket send: rejected because it preserves the current reliability gap.
  - Add separate retry logic only to the menu path: rejected because it increases divergence.

## Decision 2: Preserve existing send result shape
- **Decision**: Keep the current success/failure result contract and message ID handling.
- **Rationale**: Minimizes impact on UI, tools, and tests while still fixing reliability.
- **Alternatives considered**:
  - Introduce a new result format: rejected because it adds unnecessary migration work.

## Decision 3: Centralize origin-aware π marker rules
- **Decision**: Apply the π marker through one shared policy that checks message origin, so Agent-originated responses include π and menu-originated responses do not.
- **Rationale**: The marker is intentional and must distinguish source without relying on duplicated per-flow logic.
- **Alternatives considered**:
  - Keep a single suffix rule for every send path: rejected because it removes the Agent vs menu distinction.
  - Keep per-flow formatting: rejected because it increases drift and maintenance cost.

## Decision 4: Keep current history recording behavior
- **Decision**: Continue recording successful outgoing messages in recents.
- **Rationale**: History is already part of user value and should remain stable.
- **Alternatives considered**:
  - Defer history recording changes: rejected because it would weaken the feature completeness.
