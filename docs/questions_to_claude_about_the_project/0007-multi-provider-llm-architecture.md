# Multi-Provider LLM Architecture

## QUESTION: I'm willing to install models from other providers like Mistral and Cerbras. What is the best approach to handle with it, I mean for maintainability. When I asked about implementing external apis you told the code already has good patterns for that. What about for multiple providers and llm models?

## Current Situation

Your current `callLlm` is tightly coupled to Groq. Specifically:

- Imports Groq SDK directly, uses `groq-sdk` error classes (`RateLimitError`, `BadRequestError`)
- Groq-specific error handling (`json_validate_failed`, `failed_generation`)
- Key rotation hardcoded to `GROQ_API_KEYS`
- Single hardcoded model (`openai/gpt-oss-120b`)

But the good news: all callers (`globalRouter.ts`, `extractors.ts`, `topicShift.ts`, `subrouteRouter.ts`, unknown flow steps) only depend on `callLlm()` and its `LlmCallOptions`/`LlmCallResult` interfaces. Nobody imports `groq-sdk` directly except `client.ts`.

So the boundary is already clean — you just need to evolve `client.ts`.

## Recommended Approach

Don't build a generic provider abstraction upfront. Instead:

### 1. Add a `provider` field to `LlmCallOptions`

Callers can optionally specify which provider+model to use, defaulting to the current Groq one.

### 2. One client file per provider under `src/lib/llm/`

```
src/lib/llm/
  client.ts          → stays as the public callLlm() entrypoint
  providers/
    groq.ts          → current Groq logic extracted here
    mistral.ts       → Mistral SDK calls
    cerebras.ts      → Cerebras SDK calls
```

### 3. `callLlm` becomes a thin router

Reads the provider from options (or a config/env var), delegates to the right provider module. Each provider handles its own SDK, error classes, key rotation, and quirks.

### 4. Provider modules all return the same `LlmCallResult`

The rest of the codebase never knows which provider ran.

## Benefits

- Adding a new provider is just a new file in `providers/`
- You can choose provider per-task (e.g. Groq for fast extraction, Mistral for classification)
- No callers change — they still just call `callLlm()`
- Provider-specific quirks (Groq's `json_validate_failed`, Cerebras's error format, etc.) stay isolated
