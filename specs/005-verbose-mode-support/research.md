# Research: Verbose Mode Support

## Decision: Flag Registration
- **Selected**: `pi.registerFlag("verbose", { ... })`
- **Rationale**: The Pi Extension API provides a built-in way to register CLI flags. This ensures the flag is properly documented and recognized by the `pi` command-line parser when loading the extension.
- **Alternatives considered**: Raw `process.argv` parsing. Rejected as it bypasses the extension framework's capabilities.

## Decision: Baileys Logger Configuration
- **Selected**: Dynamic `pino` level assignment during `makeWASocket`.
- **Rationale**: Baileys takes a `logger` instance in its configuration. By detecting the `-v` flag before calling `makeWASocket`, we can initialize `pino` with level `trace` (verbose) or `silent`/`error` (default).
- **Alternatives considered**: Global `console.log` overriding. Rejected as too intrusive.

## Decision: Flag Mapping
- **Selected**: Map both `-v` and `--verbose` to the same internal `isVerbose` state.
- **Rationale**: User expectations for standard CLI tools.
