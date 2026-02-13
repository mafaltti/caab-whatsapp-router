# End-to-End Project Review: Critical Issues, Gaps, and Flaws

## Context

Full review of `caab-whatsapp-router` (Phases 0–4 implemented), cross-referencing the completeness report (`docs/phase-0-4-completeness-report.md`), the spec (`CLAUDE.md`), the plan (`docs/PLAN.md`), and all source files under `src/`.

---

## Findings by Severity

### CRITICAL

#### 1. LLM failures are silently masked as low-confidence classifications

**Files:** `src/lib/llm/globalRouter.ts:55-56`, `src/lib/routing/routeMessage.ts:102-104`

When the Groq API fails (network error, timeout, all keys exhausted), `callLlm` throws. `classifyFlow` catches it and returns `FALLBACK = { flow: "unknown", confidence: 0 }`. Back in `routeMessage`, this hits the `< 0.60` branch and the user gets:

> "Olá! Como posso te ajudar? Trabalho com certificado digital, faturamento e suporte geral."

Instead of the spec-mandated error message:

> "Desculpe, estou com dificuldades técnicas no momento. Por favor, tente novamente em alguns minutos."

The `ERROR_REPLY` in `routeMessage.ts:34` is only sent when `routeMessage` itself throws (outer catch block). But `classifyFlow` never throws — it always returns `FALLBACK`.

**Impact:** When Groq is down, users think the bot is working but confused, rather than experiencing a temporary outage. No error is surfaced. The operator also doesn't see flow-level error events (only `llm_call_error` inside `classifyFlow`).

**Fix:** `classifyFlow` should propagate errors (throw) rather than masking them as `FALLBACK`, OR return a discriminated result type (`{ ok: true, data } | { ok: false, error }`). `routeMessage` should catch LLM errors specifically and send `ERROR_REPLY`.

---

#### 2. JSON fallback message doesn't match the spec

**Files:** `src/lib/llm/globalRouter.ts:34-41`, `src/lib/routing/routeMessage.ts:102-104`

`CLAUDE.md` spec says:

> **Fallback on Invalid JSON:** Ask user: "Desculpe, não entendi. Pode reformular sua mensagem?"

When the LLM returns invalid JSON or fails schema validation, `classifyFlow` returns `FALLBACK` (confidence: 0). This triggers `FLOW_REPLIES.unknown` — a greeting, not the specified fallback message.

**Fix:** Same approach as #1: propagate the error type so `routeMessage` can differentiate between "LLM returned low confidence" vs "LLM returned garbage."

---

### HIGH

#### 3. Webhook handler blocks on full processing before returning 200

**Files:** `src/app/api/webhook/evolution/route.ts:152`

The `PLAN.md` says: *"Return 200 OK quickly (serverless timeout limit: 30s)"*. The `CLAUDE.md` says: *"Webhook handler: max 25s"*.

Current worst-case timing:

- 4 DB calls × ~2s each = 8s
- LLM call: 8s timeout
- Evolution `sendText`: 5s timeout
- **Total: ~21s** (within budget but tight)

Under load or with cold starts, this can exceed 25s. The handler awaits the entire pipeline before returning.

> **Note:** This is a known trade-off. On Vercel, you'd use `after()` (Next.js 15+) or `waitUntil()` to return 200 early and process in the background. Check which Next.js version is in use before recommending a specific fix.

---

### MEDIUM

#### 4. Outbound message persistence errors are silently swallowed

**Files:** `src/lib/routing/routeMessage.ts:136-138`

```typescript
insertOutbound(...).catch(() => {
  // error already logged inside insertOutbound via supabase
});
```

The comment is misleading. `insertOutbound` (`messageRepo.ts:53`) does `if (error) throw error;` — it doesn't log anything. The error is caught by `.catch(() => {})` and vanishes. If outbound message persistence fails, there's no log entry at all.

**Fix:** Add logging in the catch: `.catch((err) => { logger.error({ ... }) })`.

---

#### 5. userId is not normalized to digits-only

**Files:** `src/lib/webhook/normalize.ts:79`

Current:

```typescript
const userId = key.remoteJid.split("@")[0];
```

`CLAUDE.md` spec says `user_id` should be *"digits only, derived from sender."* Evolution API typically sends numeric JIDs like `5511999999999@s.whatsapp.net`, but edge cases (e.g., malformed payloads) could produce non-digit content.

This `userId` is used as the primary key in `conversation_state` and as a key in `chat_messages`. Non-digit values wouldn't break the DB (`TEXT` column), but they violate the spec and could cause issues if downstream code assumes digits-only.

**Fix:** Add `.replace(/\D/g, "")` after the split, and guard against empty result.

---

### LOW / INFORMATIONAL

#### 6. @lid guard is redundant dead code

**Files:** `src/lib/webhook/normalize.ts:78,120-126`

`isGroup` is set to `true` for `@lid` JIDs (line 78). The `isGroup` guard (line 112) runs before the `@lid` guard (line 120). The `@lid` check is unreachable.

Not harmful, but dead code creates confusion. Either remove the explicit `@lid` check or decouple it from `isGroup` for clarity.

---

#### 7. Report's "low-confidence" finding is a false positive

The completeness report flags that `< 0.60` doesn't ask a clarifying question. But the `CLAUDE.md` spec says `< 0.60`: *"Route to 'unknown' or ask open-ended question."* The current behavior sends `FLOW_REPLIES.unknown = "Olá! Como posso te ajudar?..."` which **is** an open-ended question listing available topics. This satisfies the spec's "or" clause.

The two tiers are well-differentiated:

- **0.60–0.79:** Acknowledges confusion (*"não tenho certeza"*), asks for details
- **< 0.60:** No useful signal, presents a clean capabilities menu

---

#### 8. Minor prompt injection surface

**Files:** `src/lib/llm/prompts.ts:52`

User message text is interpolated directly into the LLM prompt without sanitization. Mitigated by `response_format: { type: "json_object" }` (forces JSON output) and `temperature: 0`. Low risk for a classification task, but worth noting for future extraction tasks where output is less constrained.

---

## Summary Table

| #   | Severity | Finding                                        | Report Caught?          |
| --- | -------- | ---------------------------------------------- | ----------------------- |
| 1   | CRITICAL | LLM failures masked as low-confidence          | No                      |
| 2   | CRITICAL | JSON fallback message wrong                    | No                      |
| 3   | HIGH     | Webhook blocks before 200                      | Yes                     |
| 4   | MEDIUM   | Outbound persistence errors silently swallowed | No                      |
| 5   | MEDIUM   | userId not digits-only                         | Yes                     |
| 6   | LOW      | @lid guard is dead code                        | No                      |
| 7   | INFO     | Low-confidence finding is false positive       | N/A (corrects report)   |
| 8   | LOW      | Prompt injection surface                       | No                      |

---

## Recommended Fix Order

1. **#1 + #2** (same root cause): Make `classifyFlow` signal errors vs. low-confidence distinctly
2. **#4**: Add error logging in outbound persistence catch
3. **#5**: Digits-only `userId` normalization
4. **#3**: Investigate `after()` / `waitUntil()` for early 200 response
5. **#6**: Remove dead `@lid` guard
