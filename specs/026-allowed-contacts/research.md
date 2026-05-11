# Research: Allowed Contacts Rename

## Decision 1: Centralize wording in i18n strings
- **Decision**: Update the existing translation catalog so `Allowed Numbers` becomes `Allowed Contacts` across the allow-list flow.
- **Rationale**: The menu already resolves labels through `t(...)`, so centralized text keeps the rename consistent and avoids scattered string edits.
- **Alternatives considered**: Hardcoding new labels in the menu handler; rejected because it duplicates text and risks mixed terminology.

## Decision 2: Preserve behavior and storage
- **Decision**: Treat this feature as a wording-only change; keep allow-list contents, selection behavior, and persistence unchanged.
- **Rationale**: User request targets terminology, not list semantics.
- **Alternatives considered**: Migrating stored list data; rejected because no data format change is needed.

## Decision 3: Validate by UI wording and existing tests
- **Decision**: Use manual `/whatsapp` menu verification plus unit coverage for menu label output.
- **Rationale**: Success depends on visible text, so user-facing verification is the clearest proof.
- **Alternatives considered**: Add new end-to-end flows; rejected because the scope is small and existing menu tests are enough.
