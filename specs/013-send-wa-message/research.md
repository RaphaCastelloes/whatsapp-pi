# Research: Send WhatsApp Message Tool (JID + Text)

**Feature**: 013-send-wa-message  
**Date**: 2026-04-15

## Decision Log

### 1. Tool Registration Mechanism

- **Decision**: Use `pi.registerTool()` from `ExtensionAPI`
- **Rationale**: `registerTool()` is the only SDK mechanism that makes a capability directly callable by the LLM. `registerCommand()` is user-facing (slash commands only). The SDK type `ToolDefinition` requires a TypeBox parameter schema, a label, a description, and an `execute` function returning `Promise<AgentToolResult>`.
- **Alternatives considered**: `registerCommand` — rejected, not LLM-callable; injecting via `sendUserMessage` — rejected, it's for injecting user turns, not adding tools.

### 2. Parameter Schema

- **Decision**: `Type.Object({ jid: Type.String({ minLength: 1 }), message: Type.String({ minLength: 1 }) })` from `@sinclair/typebox`
- **Rationale**: TypeBox is the schema library required by `ToolDefinition<TParams extends TSchema>`. It is already a transitive dependency of `@mariozechner/pi-coding-agent`. The `minLength: 1` constraint enforces FR-002 (non-empty inputs) at the schema validation layer before `execute` is called.
- **Alternatives considered**: Zod (not what the SDK expects); plain JSON schema object (loses TypeScript inference for `params`).

### 3. Message Delivery

- **Decision**: Delegate entirely to `whatsappService.sendMessage(jid, message)`, which internally uses `MessageSender` with retry logic and presence indicators.
- **Rationale**: FR-003 requires delivery through the active session; `sendMessage()` already handles presence (`composing`/`paused`), the π branding suffix, retries, and socket validation. Duplicating any of this would violate DRY and SOLID.
- **Alternatives considered**: Calling `socket.sendMessage()` directly — rejected, bypasses retry logic, presence indicators, and π branding consistency.

### 4. Connection State Check (FR-007)

- **Decision**: Check `whatsappService.getStatus() !== 'connected'` at the start of `execute` and return an error result immediately.
- **Rationale**: `MessageSender.waitIfOffline()` blocks up to 30 seconds. For a synchronous tool invocation from the LLM, blocking the agent for 30 seconds is unacceptable. An immediate error result lets the LLM decide to retry or notify the user.
- **Alternatives considered**: Letting `MessageSender.waitIfOffline()` handle it — rejected due to 30-second blocking behaviour violating SC-004.

### 5. Recents Recording (FR-005)

- **Decision**: Call `recentsService.recordMessage()` only on `result.success === true`, mirroring the existing pattern in the `message_end` event handler in `whatsapp-pi.ts`.
- **Rationale**: Consistent with established convention. Recording a failed send would pollute history with phantom messages.
- **Alternatives considered**: Always record — rejected, inconsistent with existing convention.

### 6. AgentToolResult Format

- **Decision**: Return `{ type: "text", text: JSON.stringify({ success, messageId?, error?, attempts }) }` wrapped in an array as the `content` field.
- **Rationale**: The `AgentToolResult` type from `@mariozechner/pi-agent-core` requires a `content` array of `TextContent | ImageContent`. JSON stringification gives the LLM a machine-readable result it can parse or relay to the user. The `isError` flag should be set to `true` on failure so the agent loop handles errors correctly.
- **Alternatives considered**: Plain text prose — rejected, harder for the LLM to parse reliably for retry logic.

### 7. Placement in Codebase

- **Decision**: Register the tool inline in `whatsapp-pi.ts` immediately after the `registerCommand("whatsapp", ...)` block.
- **Rationale**: All extension registrations live in the factory function in `whatsapp-pi.ts`. Keeping the tool there avoids splitting a ~50-line addition into a separate file, which would over-engineer a simple registration. YAGNI applies.
- **Alternatives considered**: New file `src/tools/send-wa-message.tool.ts` — rejected for this scope; appropriate if the tool grows complex.
