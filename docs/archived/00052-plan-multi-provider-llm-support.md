# Multi-Provider LLM Support

## Context

All LLM calls currently go through a single `callLlm()` in `src/lib/llm/client.ts`, hardcoded to Groq SDK with `openai/gpt-oss-120b`. The user wants to use Mistral and Cerebras alongside Groq, choosing provider per task. Key insight: all three providers expose OpenAI-compatible APIs, so we can use the `openai` npm package with dynamic `baseURL` instead of 3 separate SDKs.

The existing architecture is already well-isolated — all 8 callers use `callLlm(options)` and never import `groq-sdk` directly. Only `client.ts` (chat) and `stt/client.ts` (audio) touch the SDK.

## Files to Create/Modify

### New Files

- `src/lib/llm/providers.ts` — provider config, env var loading, per-provider key rotation
- `src/lib/llm/taskRouter.ts` — task-to-provider mapping

### Modified Files

- `src/lib/llm/client.ts` — replace `groq-sdk` with `openai`, add provider dispatch
- `src/lib/llm/index.ts` — export new types (`ProviderId`, `LlmTask`)
- `src/lib/stt/client.ts` — migrate from `groq-sdk` to `openai` (so we can drop `groq-sdk` entirely)
- `package.json` — add `openai`, remove `groq-sdk`
- `.env.example` — new env vars
- `docs/ENVIRONMENT.md` — document new env vars
- `CLAUDE.md` — update LLM Conventions section

### Callers (one-line optional change each, 6 files)

- `src/lib/llm/globalRouter.ts` — add `task: "classify_flow"`
- `src/lib/llm/subrouteRouter.ts` — add `task: "classify_subroute"`
- `src/lib/llm/topicShift.ts` — add `task: "detect_topic_shift"`
- `src/lib/llm/extractors.ts` — add `task: "extract_data"`
- `src/lib/flows/unknown/v1/steps.ts` — add `task: "conversational_reply"`
- `src/lib/flows/generalSupport/v1/steps.ts` — add `task: "summarize"`

---

## Step-by-step Plan

### Step 1: Add `openai` dependency

```bash
npm install openai
```

Keep `groq-sdk` temporarily (STT still uses it).

### Step 2: Create `src/lib/llm/providers.ts`

Defines `ProviderId` type (`"groq" | "mistral" | "cerebras"`), `ProviderConfig` interface, and functions:

- `getProvider(id)` — reads config from env vars, caches, returns provider config
- `nextApiKey(provider)` — per-provider round-robin key rotation

Each provider configured via env vars:

| Env Var | Required? | Description |
|---|---|---|
| `GROQ_API_KEYS` | Yes (existing) | Comma-separated keys |
| `MISTRAL_API_KEYS` | No | Comma-separated keys |
| `CEREBRAS_API_KEYS` | No | Comma-separated keys |

Default models and base URLs hardcoded per provider (standard endpoints that rarely change). Optional model overrides: `GROQ_MODEL`, `MISTRAL_MODEL`, `CEREBRAS_MODEL`.

### Step 3: Create `src/lib/llm/taskRouter.ts`

Defines `LlmTask` type and `getProviderForTask(task?)` function.

Task types: `"classify_flow"`, `"classify_subroute"`, `"detect_topic_shift"`, `"extract_data"`, `"conversational_reply"`, `"summarize"`.

Routing configured via single env var:

```
LLM_TASK_ROUTING=classify_flow=mistral,extract_data=cerebras
```

Unspecified tasks default to `"groq"`.

### Step 4: Refactor `src/lib/llm/client.ts`

- Replace `import Groq from "groq-sdk"` with `import OpenAI from "openai"`
- Add optional fields to `LlmCallOptions`: `provider?`, `task?`, `model?`
- Add `provider` field to `LlmCallResult`
- Provider resolution: explicit `provider` > task-based routing > default (`"groq"`)
- Replace Groq SDK error classes with status-code checks:
  - Rate limit: `err.status === 429` (universal across providers)
  - Groq safety override: isolated in `detectGroqSafetyOverride()`, only runs when `providerId === "groq"`
- Use `new OpenAI({ apiKey, baseURL, timeout })` with provider's config

Backward compatibility: with no new fields passed, behavior is identical to current (Groq, same model, same timeouts).

### Step 5: Update barrel exports in `src/lib/llm/index.ts`

- Export `ProviderId` and `LlmTask` types

### Step 6: Add `task` field to callers (6 files, one-line each)

- These are no-ops until `LLM_TASK_ROUTING` is set
- Can be done incrementally

### Step 7: Migrate STT client to `openai` SDK

- Refactor `src/lib/stt/client.ts`: replace `groq-sdk` imports with `openai`
- Use `client.audio.transcriptions.create()` (same API shape)
- Replace error class imports with status code checks
- Remove `groq-sdk` from `package.json`

### Step 8: Update documentation

- `.env.example` — add new optional env vars with comments
- `docs/ENVIRONMENT.md` — document provider env vars and `LLM_TASK_ROUTING`
- `CLAUDE.md` — update LLM Conventions (provider, model, task routing)

---

## Verification

1. **Smoke test with Groq only** (no new env vars set): send a WhatsApp message, verify the full pipeline works unchanged — classification, extraction, reply
2. **Add a second provider**: set `MISTRAL_API_KEYS` and `LLM_TASK_ROUTING=classify_flow=mistral`, send a message, check logs show `"provider":"mistral"` for flow classification and `"provider":"groq"` for everything else
3. **Build check**: `npm run build` — no type errors
4. **Lint check**: `npm run lint` — clean
