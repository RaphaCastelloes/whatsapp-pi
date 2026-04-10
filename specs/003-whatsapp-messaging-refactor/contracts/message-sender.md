# MessageSender Contract

## Interface: IMessageSender

```typescript
interface IMessageSender {
    /**
     * Sends a message with retry logic and connection awareness.
     * @param request The message details and options.
     * @returns Promise resolving to the result of the operation.
     */
    send(request: MessageRequest): Promise<MessageResult>;
}
```

## Data Transfer Objects (DTOs)

```typescript
type MessageRequest = {
    recipientJid: string;
    text: string;
    options?: {
        maxRetries?: number;
        priority?: 'high' | 'normal';
    };
};

type MessageResult = {
    success: boolean;
    messageId?: string;
    error?: string;
    attempts: number;
};
```
