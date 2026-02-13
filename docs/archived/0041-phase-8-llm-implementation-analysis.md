# Phase 8 Analysis — LLM Implementation (Providers + Schemas + Prompts)

## Context

Phase 8 in `PLAN.md` targets "stable JSON outputs and safe fallbacks" for the LLM layer. After thorough analysis of the codebase, Phase 8 is already fully implemented. Its goals were delivered incrementally across Phases 4, 4.5, 5, 6, and the unreleased work on the unknown flow/safety override.

---

## Requirement Checklist

### 1. Centralize Prompts — DONE

All prompts live in `src/lib/llm/prompts.ts`:

- Global router (system + user, with few-shot examples)
- Topic shift (emphasizes continuity, "FAVOREÇA A CONTINUIDADE")
- Subroute router (dynamic per flow, includes per-flow examples)
- Data extraction (combined + 4 individual: person type, CPF/CNPJ, email, phone)
- Unknown conversation (text mode, turn-count-aware)

### 2. Centralize Zod Schemas — DONE

All schemas in `src/lib/llm/schemas.ts`:

- `GlobalRouterSchema` (flow enum, confidence, reason)
- `SubrouteRouterSchema` (subroute `string|null`, confidence, reason)
- `DataExtractionSchema` (combined extraction)
- `PersonTypeExtractionSchema`, `CpfCnpjExtractionSchema`, `EmailExtractionSchema`, `PhoneExtractionSchema`
- Confidence thresholds: `CONFIDENCE_ACCEPT=0.8`, `CONFIDENCE_CLARIFY=0.6`
- Subroute config: `SUBROUTE_CONFIG` with definitions per flow

### 3. Centralize Parsing + Fallback Behavior — DONE

- All routers/extractors return discriminated unions: `{ ok: true, data }` or `{ ok: false, errorType }`
- Generic `extractWithLlm<T>()` pattern for all extractors (`src/lib/llm/extractors.ts`)
- Routing layer (`src/lib/routing/routeMessage.ts`) handles fallbacks:
  - LLM errors → `ERROR_REPLY` ("dificuldades técnicas")
  - JSON/schema errors → `JSON_FALLBACK_REPLY` ("não entendi, pode reformular")
  - Safety override → forward crisis text to user

### 4. Set `temperature=0` — DONE

Default in `src/lib/llm/client.ts` is `temperature: 0`.

### 5. Invalid JSON → Fallback — DONE

- JSON parse failures return `{ ok: false, errorType: "invalid_json" }`
- Schema validation failures return `{ ok: false, errorType: "schema_validation" }`
- `SafetyOverrideError` catches Groq `json_validate_failed` for crisis messages
- Topic shift returns `null` on any error (favors continuity over crashing)

### 6. Low Confidence → Clarifying Question / Human Flow — DONE

- **Global router:** >= 0.8 accept, < 0.8 → route to "unknown" flow
- **Subroute router:** < 0.8 → ask clarifying question, stay at "start"
- **Extractors:** < 0.8 → re-ask with clearer instructions
- **Max retries (3)** → human handoff reply

### 7. Exit Criteria: "Router never crashes on weird LLM output" — DONE

- All LLM functions use try/catch, return error descriptors instead of throwing
- Only `SafetyOverrideError` propagates — caught in `routeMessage` and handled gracefully
- Top-level catch-all in `routeMessage` sends `ERROR_REPLY` for any unhandled exception

---

## Recommendation

No implementation work needed. Phase 8 should be marked as complete (✅) in `PLAN.md`, matching the pattern of Phases 0 through 6.

### Optional: Minor Observations (not blockers)

These are observations, not action items. All are by-design or low-priority:

1. **`DataExtractionSchema` vs individual extractors** — combined schema has `missing_fields` array, individual schemas don't. This is fine because individual extractors are used in step handlers that track fields themselves.
2. **Chat history hardcoded to 5 messages** — set in `routeMessage.ts`. Matches the spec in `ARCHITECTURE.md`. No need to make configurable.
3. **`SafetyOverrideError` sends raw LLM text** — by design for crisis messages (CVV 188, SAMU 192). The text is the LLM's own compassionate response, not arbitrary user content.

---

## Implementation

The only change needed is updating `docs/PLAN.md` to mark Phase 8 as complete:

**File:** `docs/PLAN.md` line 383

```markdown
## Phase 8 — LLM implementation (providers + schemas + prompts) ✅
```

## Verification

- `npm run build` passes (already passing)
- `npm run lint` passes (already passing)
- All LLM code paths have error handling (verified by code review)
