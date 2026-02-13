# Add Optional Text Mode to LLM Client

## Context

The `callLlm()` function in `src/lib/llm/client.ts` hardcodes `response_format: { type: "json_object" }`, forcing all LLM responses to be JSON. The conversational unknown flow needs plain text replies, so it currently works around this by instructing the LLM to return `{"reply": "..."}` and parsing the JSON to extract the text. This adds unnecessary complexity to both the prompt and the parsing logic.

## Changes

### 1. `src/lib/llm/client.ts` — Add `jsonMode` option

- Add `jsonMode?: boolean` to `LlmCallOptions` interface (line 26)
- Default to `true` in the destructuring (line 47) so all existing callers are unaffected
- Conditionally set `response_format` only when `jsonMode` is `true` (line 68)

### 2. `src/lib/llm/prompts.ts` — Simplify conversational prompt

- In `unknownConversationSystemPrompt()` (line 307): remove the last two lines (`Responda APENAS com JSON válido no formato:` and `{"reply": "sua resposta aqui"}`)

### 3. `src/lib/flows/unknown/steps.ts` — Simplify `getConversationalReply()`

- Pass `jsonMode: false` to `callLlm()` (line 25)
- Replace the 8-line JSON parse + type check block (lines 30–38) with `return result.content.trim() || null`

## Verification

1. `npm run build` — no TypeScript errors
2. `npm run lint` — no warnings
3. All existing JSON-mode callers (global router, topic shift, subroute router, extractors) are unchanged — they don't pass `jsonMode` so it defaults to `true`
