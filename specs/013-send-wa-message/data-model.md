# Data Model: Send WhatsApp Message Tool (JID + Text)

**Feature**: 013-send-wa-message  
**Date**: 2026-04-15

## Overview

This feature introduces no new persistent data entities. It adds a new entry point that reads from and writes to existing structures. The data model below documents the input/output shapes of the new tool and how they map to existing types.

---

## Tool Input

Defined as a TypeBox schema on the `ToolDefinition`.

| Field     | Type   | Constraint        | Description                                         |
|-----------|--------|-------------------|-----------------------------------------------------|
| `jid`     | string | minLength: 1      | WhatsApp JID of the target contact (e.g. `5511999998888@s.whatsapp.net`) |
| `message` | string | minLength: 1      | Plain-text message content to deliver               |

**Validation**: Schema validation is enforced by the Pi SDK before `execute` is called. No additional validation of JID format is required in the tool body (SC-002 is satisfied at schema layer for empty inputs; format correctness is enforced by Baileys at delivery time).

---

## Tool Output (AgentToolResult)

Returned by the `execute` function.

| Field      | Type    | Present when     | Description                                         |
|------------|---------|------------------|-----------------------------------------------------|
| `success`  | boolean | always           | Whether delivery succeeded                          |
| `messageId`| string  | success === true | Baileys-assigned message ID of the sent message     |
| `error`    | string  | success === false | Human-readable error description                    |
| `attempts` | number  | always           | Number of delivery attempts made by `MessageSender` |

The result is serialised as `JSON.stringify(result)` and returned inside a `TextContent` item in the `content` array of `AgentToolResult`. The `isError` flag mirrors `!success`.

---

## Existing Types Consumed (no changes)

### `MessageResult` (`src/models/whatsapp.types.ts`)

```
{
  success: boolean
  messageId?: string
  error?: string
  attempts: number
}
```

The tool output shape mirrors `MessageResult` exactly. The tool serialises this value directly.

### `RecentConversationMessage` (`src/models/whatsapp.types.ts`)

Written to the recents store on successful send:

```
{
  messageId: string          ← from MessageResult.messageId
  senderNumber: string       ← derived from jid ("+<digits>")
  text: string               ← the message parameter
  direction: 'outgoing'
  timestamp: number          ← Date.now() at call time
}
```

---

## State Machine (connection check)

```
execute() called
    │
    ├─ getStatus() !== 'connected' ──→ return { isError: true, content: [{ type: "text", text: '{"success":false,"error":"WhatsApp not connected","attempts":0}' }] }
    │
    └─ getStatus() === 'connected'
           │
           └─ whatsappService.sendMessage(jid, message)
                  │
                  ├─ result.success === false ──→ return { isError: true, content: [{ type: "text", text: JSON.stringify(result) }] }
                  │
                  └─ result.success === true
                         │
                         └─ recentsService.recordMessage(...)
                         └─ return { isError: false, content: [{ type: "text", text: JSON.stringify(result) }] }
```
