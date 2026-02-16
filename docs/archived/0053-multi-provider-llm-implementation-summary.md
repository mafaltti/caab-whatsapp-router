# Multi-Provider LLM — Implementation Summary

## New Files

- `src/lib/llm/providers.ts` — `ProviderId` type, `ProviderConfig` interface, `getProvider(id)` with env-based config + caching, `nextApiKey()` for per-provider round-robin key rotation
- `src/lib/llm/taskRouter.ts` — `LlmTask` type, `getProviderForTask(task?)` reads `LLM_TASK_ROUTING` env var to map tasks to providers

## Modified Files

- `src/lib/llm/client.ts` — replaced `groq-sdk` with `openai` SDK; `callLlm()` now accepts optional `provider`, `task`, `model` fields; provider resolution: explicit > task-based > default (`"groq"`); rate limiting uses `err.status === 429` (universal); Groq safety override isolated to `detectGroqSafetyOverride()` running only for `providerId === "groq"`; `LlmCallResult` includes `provider` field
- `src/lib/stt/client.ts` — migrated from `groq-sdk` to `openai` SDK, reuses `getProvider("groq")` and `nextApiKey()` from providers module
- `src/lib/llm/index.ts` — exports `ProviderId` and `LlmTask` types
- 6 caller files — added `task` field (one-line each): `globalRouter.ts`, `subrouteRouter.ts`, `topicShift.ts`, `extractors.ts`, `unknown/v1/steps.ts`, `generalSupport/v1/steps.ts`
- `package.json` — added `openai`, removed `groq-sdk`
- `.env.example` — new optional env vars for Mistral, Cerebras, model overrides, task routing
- `docs/ENVIRONMENT.md` — documented new provider env vars and `LLM_TASK_ROUTING`
- `CLAUDE.md` — updated LLM Conventions section for multi-provider architecture

## Backward Compatibility

With no new env vars set, behavior is identical to before — all tasks route to Groq with the same model and timeouts.
