# Handle Groq `json_validate_failed` Safety Override

## Context

When a user sends a crisis/self-harm message, the LLM's safety training overrides `jsonMode: true` and generates a compassionate crisis response (CVV hotline 188, SAMU 192). Groq rejects this as invalid JSON, returning a 400 `json_validate_failed` error with the crisis text in `failed_generation`. Currently the user gets a generic "dificuldades técnicas" message — the worst possible response in this situation.

The fix: detect this specific error, extract the `failed_generation` text, and forward it as the reply.

## Approach

Create a `SafetyOverrideError` that propagates from `callLlm()` through all intermediate catch blocks up to `routeMessage()`'s outer catch, which sends the crisis text as the reply. Session state is left untouched.

## Files to Modify (8)

### 1. `src/lib/llm/client.ts` — Detect + throw

- Import `BadRequestError` from `groq-sdk/error` (alongside existing `RateLimitError`)
- Add exported `SafetyOverrideError` class: extends `Error`, carries `failedGeneration: string`
- In `callLlm()` catch block, after the `RateLimitError` check (line 102) and before the general error log (line 104): detect `BadRequestError` with `code === "json_validate_failed"` and non-empty `failed_generation` → throw `SafetyOverrideError`
- Access path: `(err.error as any)?.error?.code` / `(err.error as any)?.error?.failed_generation`

### 2. `src/lib/llm/index.ts` — Re-export

- Add `SafetyOverrideError` to the client re-exports (line 23)

### 3–6. Re-throw in 4 LLM Callers (1 line each)

Each file: import `SafetyOverrideError` from `./client`, add `if (err instanceof SafetyOverrideError) throw err;` as the first line of the existing catch block.

| File | Catch location |
|---|---|
| `src/lib/llm/globalRouter.ts` | line 30 (`classifyFlow`) |
| `src/lib/llm/topicShift.ts` | line 155 (`detectTopicShift`) — also add `(err)` parameter to bare catch |
| `src/lib/llm/subrouteRouter.ts` | line 55 (`classifySubroute`) |
| `src/lib/llm/extractors.ts` | line 60 (`extractWithLlm`) |

### 7. `src/lib/flows/engine.ts` — Re-throw from step handler catch

- Import `SafetyOverrideError` from `@/lib/llm`
- At line 162 catch block: add `if (err instanceof SafetyOverrideError) throw err;` before existing error handling
- Critical: step handlers call extractors and `classifyFlow` (unknown flow), which would otherwise be swallowed here

### 8. `src/lib/routing/routeMessage.ts` — Terminal handler

- Import `SafetyOverrideError` from `@/lib/llm`
- In outer catch (line 256): add `SafetyOverrideError` check before existing error handling
  - Log event: `"safety_override"` at info level (no PII)
  - `await sendText(...)` with `err.failedGeneration` (`await`, not fire-and-forget — delivery matters)
  - Persist outbound via `insertOutbound()` (fire-and-forget with error logging, same pattern as rest of file)
  - `return` — do NOT touch session state

## Error Propagation Paths (all converge at `routeMessage` outer catch)

| Trigger point | Propagation |
|---|---|
| `classifyFlow()` from `routeMessage` | `classifyFlow` re-throws → `routeMessage` catch |
| `detectTopicShift()` from `routeMessage` | `topicShift` re-throws → `routeMessage` catch |
| `classifySubroute()` from `engine.ts` line 57 | `subrouteRouter` re-throws → engine (no local catch) → `routeMessage` catch |
| `extractWithLlm()` from step handler | extractors re-throws → step handler → engine catch (re-throws) → `routeMessage` catch |
| `classifyFlow()` from `unknown/steps.ts` | `globalRouter` re-throws → step handler → engine catch (re-throws) → `routeMessage` catch |

## Design Decisions

- **Session unchanged:** crisis response is a one-time intercept, user resumes their flow on next message
- **Bubble-up pattern:** LLM modules stay pure (no side effects), reply sent only at `routeMessage` level
- **`jsonMode` guard not needed in `callLlm`:** `json_validate_failed` can only occur when `response_format: json_object` was set, which only happens with `jsonMode: true`
- **`failed_generation` is not PII:** it's model-generated generic advice (CVV number, SAMU number), safe to persist

## Verification

1. `npm run build` — type-checks all changes
2. `npm run lint` — clean
3. Manual test: send a crisis-themed message → should receive the model's crisis response instead of generic error
4. Manual test: send a normal message after → should resume previous flow normally (session untouched)
