<!-- 671a402c-23f0-407c-8f04-aad221b84817 7df2471c-4b8f-47fb-9042-3b1608fe48da -->
# Context Maintenance Improvement Plan

## 1. Backend Update (`app/api/chat/route.ts`)

- Change the logic to explicitly create a chat session using `ai.chats.create()` or `model.startChat()`.
- **History Management**:
    - Separate the *incoming* message (last one) from the *history* (all previous ones).
    - Initialize the chat with the `history`.
    - Send the new message using `chat.sendMessageStream()`.
- **Benefits**: This leverages the SDK's internal handling of chat history, which is more robust than manually constructing the `contents` array for `generateContentStream` every time, although strictly speaking `generateContentStream` with full history is also valid. Using `chats` is semantically better and ensures correct role alternation.

## 2. Verification

- Test multi-turn conversations (e.g., "My name is Alice" -> "What is my name?").
- Ensure context is preserved across turns.