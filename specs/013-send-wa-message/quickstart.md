# Quickstart: Send WhatsApp Message Tool (JID + Text)

**Feature**: 013-send-wa-message  
**Date**: 2026-04-15

## What this adds

A new LLM-callable tool `send_wa_message` that lets Pi send a WhatsApp message to any contact by providing only a JID and message text. No prior inbound message is required.

---

## Prerequisites

- WhatsApp session must be connected (run `/whatsapp` → Connect if needed).
- The target contact's JID must be known (format: `<digits>@s.whatsapp.net`).

---

## How Pi uses the tool

When Pi decides to send a WhatsApp message proactively, it will call:

```json
{
    "tool": "send_wa_message",
    "parameters": {
        "jid": "5511999998888@s.whatsapp.net",
        "message": "Hello! I have an update for you."
    }
}
```

Pi receives back:

```json
{
    "success": true,
    "messageId": "3EB0F1234ABCD",
    "attempts": 1
}
```

On failure:

```json
{
    "success": false,
    "error": "WhatsApp not connected",
    "attempts": 0
}
```

---

## Implementation location

All changes are in `whatsapp-pi.ts`. A `registerTool` call is added inside the existing extension factory function, after the `registerCommand("whatsapp", ...)` block:

```typescript
pi.registerTool({
    name: "send_wa_message",
    label: "Send WhatsApp Message",
    description: "Send a WhatsApp message to a contact identified by their JID...",
    parameters: Type.Object({
        jid: Type.String({ minLength: 1, description: "..." }),
        message: Type.String({ minLength: 1, description: "..." })
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
        // 1. Guard: check connection
        // 2. Send via whatsappService.sendMessage(params.jid, params.message)
        // 3. Record in recents on success
        // 4. Return JSON-serialised result
    }
});
```

---

## Running tests

```bash
npm test
```

Specifically, the new unit test file is:

```
tests/unit/send-wa-message.tool.test.ts
```

Tests cover:
- Returns error when WhatsApp is not connected
- Returns success result with messageId on delivery
- Returns failure result on delivery error
- Records to recents on success
- Does NOT record to recents on failure

---

## Key files changed

| File | Change |
|------|--------|
| `whatsapp-pi.ts` | Add `pi.registerTool(...)` block + `Type` import from `@sinclair/typebox` |
| `tests/unit/send-wa-message.tool.test.ts` | New unit test file |
