# Handle Groq `json_validate_failed` Safety Override — Implementation Summary

All 8 files modified, build passes, lint clean. Here's a summary of what was done:

## Changes Made

1. **`src/lib/llm/client.ts`** — Imported `BadRequestError`, added `SafetyOverrideError` class (carries `failedGeneration` string), and in `callLlm()` catch block: detects `BadRequestError` with `code === "json_validate_failed"` + non-empty `failed_generation` → throws `SafetyOverrideError`

2. **`src/lib/llm/index.ts`** — Re-exports `SafetyOverrideError`

3. **`src/lib/llm/globalRouter.ts`** — Re-throws `SafetyOverrideError` before logging/swallowing in `classifyFlow()` catch

4. **`src/lib/llm/topicShift.ts`** — Added `(err)` param to bare catch, re-throws `SafetyOverrideError` in `detectTopicShift()`

5. **`src/lib/llm/subrouteRouter.ts`** — Re-throws `SafetyOverrideError` in `classifySubroute()` catch

6. **`src/lib/llm/extractors.ts`** — Re-throws `SafetyOverrideError` in `extractWithLlm()` catch

7. **`src/lib/flows/engine.ts`** — Re-throws `SafetyOverrideError` from step handler catch (prevents swallowing errors from extractors/classifiers called within step handlers)

8. **`src/lib/routing/routeMessage.ts`** — Terminal handler: catches `SafetyOverrideError`, logs `safety_override` event at info level, awaits `sendText` with the crisis response, persists outbound (fire-and-forget), returns without touching session state
