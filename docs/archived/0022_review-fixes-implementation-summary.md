# Review Fixes: Implementation Summary

All fixes implemented and TypeScript compiles cleanly. Here's a summary of every change:

---

## Fix #1 + #2 (CRITICAL): LLM failures no longer masked as low-confidence

- **`src/lib/llm/globalRouter.ts`** — `classifyFlow` now returns a discriminated union `ClassifyFlowResult`: `{ ok: true, data }` for successful classification, `{ ok: false, errorType }` for failures. Three error types: `"llm_error"`, `"invalid_json"`, `"schema_validation"`.

- **`src/lib/llm/index.ts`** — Exports the new `ClassifyFlowResult` type.

- **`src/lib/routing/routeMessage.ts`** — When `classifyFlow` fails:
  - `llm_error` → sends spec-mandated *"Desculpe, estou com dificuldades técnicas..."*
  - `invalid_json` / `schema_validation` → sends spec-mandated *"Desculpe, não entendi. Pode reformular sua mensagem?"*
  - Both cases return early (no session upsert for broken classifications).

---

## Fix #4 (MEDIUM): Outbound persistence errors now logged

- **`src/lib/routing/routeMessage.ts`** — Both `.catch()` blocks on `insertOutbound` (main path + error path) now log with `event: "outbound_persist_error"`, correlation ID, user ID, instance, and error message.

---

## Fix #5 (MEDIUM): userId normalized to digits-only

- **`src/lib/webhook/normalize.ts:79-80`** — Added `.replace(/\D/g, "")` after `split("@")[0]` and early return `null` if result is empty.

---

## Fix #6 (LOW): Dead @lid guard removed

- **`src/lib/webhook/normalize.ts`** — Removed the unreachable `@lid` check in `applyGuards` (already covered by `isGroup` guard on line 113).

---

## Fix #3 (HIGH): Early 200 response with `after()`

- **`src/app/api/webhook/evolution/route.ts`** — Next.js 15.3 supports `after()`. All heavy processing (dedupe, session load, routing, LLM, API calls) is now deferred via `after()`. The webhook returns 200 immediately after lightweight validation (parse → normalize → guards), eliminating timeout risk entirely.
