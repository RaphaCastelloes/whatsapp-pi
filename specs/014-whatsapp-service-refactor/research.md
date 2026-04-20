# Research: WhatsApp Service Refactor

**Feature**: `014-whatsapp-service-refactor`  
**Date**: 2026-04-20  
**Status**: Complete

## Findings

### 1) Preserve the current public service shape
- **Decision**: Keep the current `WhatsAppService` methods and observable behavior intact.
- **Rationale**: The feature is a refactor, so callers should not need to change. Preserving the public surface lowers regression risk.
- **Alternatives considered**:
  - Replacing the service with a new abstraction.
  - Renaming or removing existing methods.
  - Changing status semantics.
- **Why rejected**: Each alternative would create avoidable churn and require wider test updates.

### 2) Separate connection lifecycle from message flow handling
- **Decision**: Split the implementation into smaller internal responsibilities for socket startup/cleanup, connection update handling, and message processing.
- **Rationale**: The current file mixes setup, event wiring, reconnect policy, message filtering, and sending. Separating those concerns supports SRP and makes the code easier to reason about.
- **Alternatives considered**:
  - Keeping everything in one class with additional comments.
  - Moving logic into one large helper.
- **Why rejected**: Comments do not reduce complexity, and a single helper would only move the coupling elsewhere.

### 3) Reuse the existing send path
- **Decision**: Continue routing outgoing sends through the existing sender flow rather than introducing a second delivery implementation.
- **Rationale**: The sender already encapsulates retry behavior, presence updates, and the existing outgoing message format.
- **Alternatives considered**:
  - Duplicating send logic in `WhatsAppService`.
  - Creating a brand-new message dispatch pipeline.
- **Why rejected**: Both options increase duplication and the chance of behavior drift.

### 4) Keep incoming filtering and recording behavior stable
- **Decision**: Preserve allow/block filtering, message recording, and Pi-message suppression as current visible behavior.
- **Rationale**: These rules are already part of the application contract and are validated by unit tests.
- **Alternatives considered**:
  - Revising filter rules during the refactor.
  - Combining filtering with unrelated connection logic.
- **Why rejected**: Scope creep would make validation harder and risk altering user-facing behavior.

### 5) Strengthen typing in touched code
- **Decision**: Replace unsafe `any` usage in the refactored paths with narrower types or interfaces where practical.
- **Rationale**: The constitution requires TypeScript excellence, and tighter typing makes the refactor safer.
- **Alternatives considered**:
  - Leaving the existing `any` usage untouched.
  - Introducing broad generic types.
- **Why rejected**: Leaving `any` perpetuates the current weakness, while over-generic typing would reduce readability.

## Outcome

No unresolved clarifications remain. The refactor can proceed with the existing codebase, current tests, and the documented behavior constraints.
