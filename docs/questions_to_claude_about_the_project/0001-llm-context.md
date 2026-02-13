# Unknown Flow — LLM Context Q&A

## What context does the LLM receive to produce output?

The conversational LLM in the unknown flow receives two inputs via `callLlm`:

- **System prompt (`unknownConversationSystemPrompt()`):** Static instructions — act as CAAB assistant, available services, keep replies short, no menus, return `{"reply": "..."}`.
- **User prompt (`unknownConversationUserPrompt(text, chatHistory)`):** Built from `formatChatHistory()` + current message. It looks like:

```
Histórico recente:
Usuário: Bom dia
Assistente: Bom dia! Como posso ajudar você hoje?

Mensagem atual: Estou me sentindo mal.
```

The `chatHistory` comes from `loadRecentMessages(userId, 5)` — the last 5 messages from `chat_messages` in Supabase.

**The key problem:** the conversational LLM has no idea that `classifyFlow()` is running in parallel. It doesn't know about the handoff mechanism. So it always generates a "still trying to understand" response, even when the classifier has already identified the intent. That's exactly what caused the contradictory double-message we just fixed — the LLM said *"Posso ajudar com algo?"* while the classifier already routed to `general_support`.

---

## Do you think there is any other information that could be valuable?

The most impactful addition would be the **user's name (`pushName`)**. WhatsApp messages carry this via Evolution API, and using it makes replies feel personal — *"Bom dia, João! Como posso te ajudar?"* instead of the generic *"Bom dia! Como posso ajudar você hoje?"*.

Not currently captured. Evolution API's `messages.upsert` webhook includes `pushName` (the contact's WhatsApp display name) in `data`, but we're not extracting it. Here's what would be most valuable:

1. **`pushName` (user's name)** — Highest impact. Turns generic *"Bom dia! Como posso ajudar?"* into *"Bom dia, João! Como posso te ajudar?"* — feels much more natural on WhatsApp. Easy to add: extract from webhook payload, pass through `NormalizedMessage`, include in the user prompt.

2. **Time of day** — Already available via `message.timestamp`. Would let the LLM always use the correct greeting (*bom dia* / *boa tarde* / *boa noite*) even if the user doesn't specify one. Minor but polishes the experience.

3. **Turn count** — Already in `state.data._turn_count`. Could make the LLM more direct on later turns (*"Você pode me dizer especificamente o que precisa?"*) instead of staying equally open-ended every time.

Of these, **`pushName` is by far the biggest win** — it's the difference between feeling like a bot and feeling like a person.
