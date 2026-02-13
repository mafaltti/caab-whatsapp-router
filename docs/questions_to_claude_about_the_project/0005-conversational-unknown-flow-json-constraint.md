# Conversational Unknown Flow — JSON Output Constraint

## QUESTION: When we chatted about "conversational unknown flow" you mentioned about a constraint regarding JSON output. Please explain this again with more details.

The constraint is in `src/lib/llm/client.ts:68`. Every LLM call goes through `callLlm()`, which hardcodes this parameter:

```typescript
response_format: { type: "json_object" }
```

This tells Groq to force the LLM to output valid JSON. It's a Groq/OpenAI feature that guarantees the response is parseable JSON — the model literally cannot return plain text. This is great for classification and extraction (global router, subroute router, data extractors), where we always want structured JSON validated with Zod.

**The problem:** For the conversational unknown flow, I needed the LLM to return a natural text reply like "Boa noite! Como posso ajudar você hoje?" — but `callLlm` won't let it return plain text.

### Two Options Considered

1. **Modify `callLlm`** — Add an optional `jsonMode: boolean` parameter (default `true`) so the conversational call could pass `jsonMode: false` and get plain text back. This would require changing a 5th file beyond the 4 in the plan.

2. **Work within the constraint** — Keep JSON mode and have the conversational prompt return `{"reply": "sua resposta aqui"}`. Then parse the `reply` field out of the JSON.

### Chosen Approach: Option 2

I went with option 2. That's why `unknownConversationSystemPrompt()` ends with:

```
Responda APENAS com JSON válido no formato:
{"reply": "sua resposta aqui"}
```

And `getConversationalReply()` in `steps.ts` parses it:

```typescript
const parsed = JSON.parse(result.content);
// extract parsed.reply as string
```

It's a pragmatic workaround — the LLM "thinks" it's returning structured data, but really it's just wrapping its conversational text in a JSON envelope.

**The tradeoff** is a slightly unnatural prompt instruction, but it avoids touching the shared LLM client that all other callers depend on.

## QUESTION: What would be the best approach in this case to avoid workaround?

Add the optional parameter to `callLlm`. It's a one-line change:

```typescript
// client.ts
export interface LlmCallOptions {
  // ...existing fields...
  jsonMode?: boolean;  // defaults to true
}
```

Then in the create call:

```typescript
response_format: jsonMode === false ? undefined : { type: "json_object" },
```

This way:

- All existing callers (global router, topic shift, subroute router, extractors) keep working exactly as before — `jsonMode` defaults to `true`
- Conversational calls pass `jsonMode: false` and get plain text back
- The prompt no longer needs the awkward `{"reply": "..."}` JSON envelope instruction
- `getConversationalReply()` just returns `result.content` directly instead of parsing JSON

It's the cleaner approach. I avoided it initially to keep the change set to exactly 4 files as the plan specified, but the workaround added complexity in the wrong place (prompt + parsing) to avoid a trivial change in the right place (client).
