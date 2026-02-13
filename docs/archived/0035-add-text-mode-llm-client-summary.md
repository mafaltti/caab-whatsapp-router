# Add Optional Text Mode to LLM Client — Implementation Summary

All done. Here's a summary of the changes:

1. **`src/lib/llm/client.ts`** — Added `jsonMode?: boolean` option (defaults to `true`). When `false`, the `response_format` constraint is omitted from the API call.

2. **`src/lib/llm/prompts.ts`** — Removed the JSON format instruction (`Responda APENAS com JSON válido...` and `{"reply": "..."}`) from `unknownConversationSystemPrompt()`. The LLM now replies with plain text.

3. **`src/lib/flows/unknown/steps.ts`** — Passes `jsonMode: false` to `callLlm()` and replaced the 8-line JSON parse block with `return result.content.trim() || null`.

Build and lint both pass cleanly. All existing JSON-mode callers are unaffected since `jsonMode` defaults to `true`.
