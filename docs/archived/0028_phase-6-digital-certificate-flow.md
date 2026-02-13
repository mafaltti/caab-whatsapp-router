## Phase 6 — Digital Certificate Flow Implementation

### Context

The `digital_certificate` flow is currently a single-step placeholder (`src/lib/flows/digitalCertificate/`). All supporting infrastructure is already in place: the flow engine handles subroute classification automatically, LLM extractors for `person_type`/`cpf_cnpj`/`email`/`phone` exist, Zod schemas are defined, and `SUBROUTE_CONFIG` already lists the 5 subroutes. This phase replaces the placeholder with a complete multi-subroute, multi-step flow.

No changes are needed to the engine, registry, LLM layer, database, or webhook code.

---

### File Changes Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/flows/digitalCertificate/validation.ts` | CREATE | CPF/CNPJ/email/phone validation |
| `src/lib/flows/digitalCertificate/helpers.ts` | CREATE | Protocol ID, retry tracking, confirmation detection, formatting |
| `src/lib/flows/digitalCertificate/subroutes/purchase.ts` | CREATE | 6 step handlers (most complex subroute) |
| `src/lib/flows/digitalCertificate/subroutes/renewal.ts` | CREATE | 3 step handlers |
| `src/lib/flows/digitalCertificate/subroutes/support.ts` | CREATE | 3 step handlers |
| `src/lib/flows/digitalCertificate/subroutes/requirements.ts` | CREATE | 2 step handlers |
| `src/lib/flows/digitalCertificate/subroutes/status.ts` | CREATE | 1 step handler + mock status lookup |
| `src/lib/flows/digitalCertificate/steps.ts` | MODIFY | Update `handleStart` message |
| `src/lib/flows/digitalCertificate/flow.ts` | MODIFY | Add `subroutes` property wiring all 5 subroutes |

---

### Step 1 — Create `validation.ts`

Pure validation functions, no external dependencies.

- **`isValidCpf(digits)`** — 11 digits, not all same digit
- **`isValidCnpj(digits)`** — 14 digits, not all same digit
- **`isValidCpfCnpj(digits, personType)`** — dispatches to CPF or CNPJ
- **`isValidEmail(email)`** — contains `@` with domain
- **`isValidPhone(digits)`** — 10–11 digits

No mathematical check-digit validation at MVP — just length + not-all-same.

---

### Step 2 — Create `helpers.ts`

Shared utilities used by multiple subroutes:

- **`generateProtocolId()`** — format `CD-YYYYMMDD-XXXX` (date + 4-char hex)
- **Retry tracking** — `getRetryCount(data, field)`, `incrementRetry(data, field)`, `isMaxRetriesReached(data, field)` using `data.{field}_retry_count` keys; max 3 retries
- **`HUMAN_HANDOFF_REPLY`** — standard message when max retries exceeded
- **`detectConfirmation(text)`** — rule-based yes/no detection (returns `"yes"` | `"no"` | `"unclear"`); matches "sim", "s", "correto", "ok" / "não", "nao", "n", "errado", etc.
- **`detectFieldToCorrect(text)`** — keyword + number-based field detection for correction flow
- **`FIELD_TO_STEP`** — maps field names to step names for routing back during correction
- **Formatting** — `formatPurchaseSummary(data)`, `formatRenewalSummary(data)`, `formatSupportSummary(data)`

---

### Step 3 — Create `subroutes/purchase.ts` (most complex)

**Key design: `_asked_X` sentinel pattern**

The engine calls the entry step immediately with the classification trigger message. To distinguish "asking the question" from "processing the answer", each step checks a `_asked_X` flag in `state.data`:

- First call (no flag): ask the question, set flag, return same step as `nextStep`
- Subsequent calls (flag set): extract/validate from user message, advance or retry

#### Steps

**`ask_person_type`** (entryStep)

- First call: ask "Pessoa física ou jurídica?"
- Process: `extractPersonType()` → if confidence >= 0.80, store `data.person_type`, advance to `ask_cpf_cnpj`
- Retry if extraction fails; human handoff after 3 retries

**`ask_cpf_cnpj`**

- Ask: "Envie seu CPF/CNPJ" (label based on `data.person_type`)
- Process: `extractCpfCnpj({ expectedType })` → validate with `isValidCpfCnpj()` → advance to `ask_email`
- Retry on invalid digits or low confidence; human handoff after 3 retries

**`ask_email`**

- Ask: "Qual seu melhor email?"
- Process: `extractEmail()` → validate with `isValidEmail()` → advance to `ask_phone`

**`ask_phone`**

- Ask: "Qual seu telefone com DDD?"
- Process: `extractPhone()` → validate with `isValidPhone()` → show `formatPurchaseSummary()`, advance to `confirm`

**`confirm`**

- `detectConfirmation(text)`:
  - `"yes"` → generate protocol, send final message, `done: true`
  - `"no"` → list fields (1–4), advance to `ask_correction`
  - `"unclear"` → re-ask

**`ask_correction`**

- `detectFieldToCorrect(text)` (also handles numeric selection 1–4)
- Clears old field value, sets `_asked_X: true` and `_correcting: true`
- Replies with the re-ask question for that field, routes to the corresponding step
- When a collection step succeeds and sees `_correcting: true`, it routes back to `confirm` (showing updated summary) instead of continuing to the next field

---

### Step 4 — Update `steps.ts`

Change `handleStart` from "coming soon" to a helpful prompt:

> "Posso te ajudar com certificado digital! Você gostaria de comprar, renovar, verificar status, tirar dúvidas sobre requisitos ou precisa de suporte técnico?"

This is a defensive fallback — the engine's subroute classifier handles routing, but if it fails, this guides the user.

---

### Step 5 — Create `subroutes/renewal.ts`

**entryStep:** `ask_order_id`

**Steps:** `ask_order_id` → `ask_email` → `confirm`

- **`ask_order_id`** — collect order/pedido number (simple text, no LLM needed, just length check >= 3)
- **`ask_email`** — reuses `extractEmail()` + `isValidEmail()`
- **`confirm`** — yes → protocol + done; no → restart subroute

---

### Step 6 — Create `subroutes/support.ts`

**entryStep:** `ask_problem`

**Steps:** `ask_problem` → `ask_order_id` → `confirm`

- **`ask_problem`** — collect problem description (min 5 chars)
- **`ask_order_id`** — optional — user can reply "não" to skip
- **`confirm`** — yes → protocol + done + "técnico entrará em contato"; no → restart

---

### Step 7 — Create `subroutes/requirements.ts`

**entryStep:** `show_info`

**Steps:** `show_info` → `offer_purchase`

- **`show_info`** — display requirements list (PF: RG/CNH, CPF, comprovante; PJ: contrato social, CNPJ, doc responsável, comprovante), then ask if user wants to start purchase
- **`offer_purchase`** — yes → end session (user's next message triggers fresh subroute classification into purchase); no → end session with goodbye

> **Note:** step handlers cannot change `activeSubroute`, so transitioning to purchase requires ending the session first.

---

### Step 8 — Create `subroutes/status.ts`

**entryStep:** `ask_order_id`

**Steps:** `ask_order_id` (with mock lookup built in)

- Collect order ID, then call mock `getMockOrderStatus()` which varies response by last digit of order ID
- Display status (Em processamento / Aguardando validação / Concluído) + detail, `done: true`

---

### Step 9 — Update `flow.ts`

Replace the placeholder with the full `FlowDefinition` including all 5 subroutes:

```typescript
subroutes: {
  purchase:     { entryStep: "ask_person_type", steps: { ... } },
  renewal:      { entryStep: "ask_order_id",    steps: { ... } },
  support:      { entryStep: "ask_problem",     steps: { ... } },
  requirements: { entryStep: "show_info",       steps: { ... } },
  status:       { entryStep: "ask_order_id",    steps: { ... } },
}
```

No changes to `registry.ts` — it already imports `digitalCertificateFlow`.

---

### Verification

1. **Build check:** `npm run build` must pass with no TypeScript errors
2. **Lint check:** `npm run lint` must pass
3. **Manual test via webhook** (with ngrok + Evolution API):
   - "Preciso de certificado digital" → enters flow
   - "Quero comprar" → subroute classification → purchase entry step asks person type
   - Complete full purchase flow with valid PF data (CPF = 11 digits)
   - Test invalid CPF → retry message → after 3 retries → human handoff
   - Test confirmation "não" → correction flow → return to confirm
   - Test renewal, support, requirements, and status subroutes
   - Test session persistence across multiple messages
