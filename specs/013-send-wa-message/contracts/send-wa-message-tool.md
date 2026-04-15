# Contract: `send_wa_message` Tool

**Feature**: 013-send-wa-message  
**Date**: 2026-04-15  
**Type**: Pi Extension LLM Tool

---

## Tool Identity

| Property      | Value                                                                 |
|---------------|-----------------------------------------------------------------------|
| `name`        | `send_wa_message`                                                     |
| `label`       | `Send WhatsApp Message`                                               |
| `description` | `Send a WhatsApp message to a contact identified by their JID (e.g. 5511999998888@s.whatsapp.net). Returns a JSON result with success status and messageId or error.` |

---

## Parameter Schema

```typescript
Type.Object({
    jid: Type.String({
        minLength: 1,
        description: "WhatsApp JID of the recipient, e.g. 5511999998888@s.whatsapp.net"
    }),
    message: Type.String({
        minLength: 1,
        description: "Plain-text message content to send"
    })
})
```

### Parameter Constraints

| Parameter | Required | Minimum | Format notes |
|-----------|----------|---------|-------------|
| `jid`     | yes      | 1 char  | Should end with `@s.whatsapp.net` for individual contacts. Group JIDs (`@g.us`) are not officially supported in v1. |
| `message` | yes      | 1 char  | Plain text only. The π branding suffix is applied internally. |

---

## Return Value

The tool returns an `AgentToolResult` with a single `TextContent` item whose `text` is the JSON-serialised `SendWaMessageResult`.

### `SendWaMessageResult`

```typescript
interface SendWaMessageResult {
    success: boolean;
    messageId?: string;   // present when success === true
    error?: string;       // present when success === false
    attempts: number;
}
```

### Success response

```json
{
    "success": true,
    "messageId": "3EB0F1234ABCD",
    "attempts": 1
}
```

`AgentToolResult.isError` = `false`

### Failure response

```json
{
    "success": false,
    "error": "WhatsApp not connected",
    "attempts": 0
}
```

`AgentToolResult.isError` = `true`

---

## Error Conditions

| Condition | `success` | `error` value | `isError` |
|-----------|-----------|---------------|-----------|
| WhatsApp not connected | false | `"WhatsApp not connected"` | true |
| Schema validation fails (empty jid/message) | — | SDK rejects before execute | — |
| Delivery failed after retries | false | Error message from `MessageSender` | true |
| Socket not initialised | false | `"WhatsApp socket not initialized"` | true |

---

## Side Effects

1. **Presence indicator**: `composing` is sent before delivery and `paused` after, via the existing `whatsappService.sendMessage()` pipeline.
2. **π branding**: The message text will have ` π` appended internally by `MessageSender`.
3. **Recents update**: On success, the outgoing message is recorded in the recents store for the target contact.
4. **No `lastRemoteJid` update**: Unlike inbound message handling, this tool does NOT update `lastRemoteJid`. The next inbound message from a different contact will still take precedence for future auto-replies.

---

## Invariants

- The tool MUST NOT block for more than ~1 second when WhatsApp is disconnected.
- The tool MUST NOT record to recents on failure.
- The tool MUST preserve all existing behaviours of `WhatsAppService.sendMessage()` (retry, presence, branding).
