# Quickstart: Reliable Messaging

**Feature**: Refactor WhatsApp message sending

## For Developers

### Using the MessageSender

Instead of calling `whatsappService.sendMessage` directly, use the `MessageSender` for better reliability.

```typescript
const sender = new MessageSender(whatsappService);

const result = await sender.send({
    recipientJid: '123456789@s.whatsapp.net',
    text: 'Hello from Pi!'
});

if (result.success) {
    console.log(`Message sent with ID: ${result.messageId}`);
} else {
    console.error(`Failed to send message: ${result.error}`);
}
```

## Integration Points

- **WhatsAppService**: Must be passed to `MessageSender` to provide the active socket.
- **Error Handling**: Catch specific `WhatsAppError` types to handle different failure modes (e.g., unauthorized, invalid JID).
