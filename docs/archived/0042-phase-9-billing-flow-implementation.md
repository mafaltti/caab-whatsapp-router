# Phase 9 — Billing/Payment Flow Implementation

## Context

The billing flow exists as a stub that returns "coming soon" and immediately ends the session. Phase 9 replaces this stub with a functional invoice status check flow. All infrastructure is already in place (flow registered in registry, schemas, prompts) — only the flow logic needs to be implemented.

## Design Decision: Step Consolidation

The `FLOWS.md` spec defines 3 logical steps: `ask_invoice_id` → `lookup_invoice` → `done_billing`. However, the flow engine executes one step per user message. A separate `lookup_invoice` step would require the user to send an additional message before seeing results — poor UX.

Following the existing digital certificate status subroute pattern (`src/lib/flows/digitalCertificate/subroutes/status.ts`), the lookup + response formatting + closing message are all combined into the second pass of `ask_invoice_id`. This is the established pattern in the codebase.

## Files to Change

### 1. CREATE `src/lib/flows/billing/helpers.ts`

Shared utilities for the billing flow:

- **`getMockInvoiceStatus(invoiceId: string): InvoiceStatus`** — mock data based on last digit:
  - Digits 0–3 → Pago (R$ 350,00, payment date shown)
  - Digits 4–6 → Pendente (R$ 450,00, due date, payment instructions)
  - Digits 7–9 or letter → Vencido (R$ 280,00, overdue warning)
- **`formatInvoiceResponse(invoiceId, invoice): string`** — formatted billing status message with emojis
- **Retry helpers** — `getRetryCount`, `incrementRetry`, `isMaxRetriesReached` (`MAX_RETRIES = 3`)
- **`HUMAN_HANDOFF_REPLY`** constant

### 2. CREATE `src/lib/flows/billing/subroutes/status.ts`

Single step handler following the digital certificate status pattern:

- **`handleAskInvoiceId`:**
  - 1st call (no `_asked_invoice_id` flag): asks for invoice/order number
  - 2nd call: validates input (min 3 chars), retries with increment on failure, human handoff after 3 retries
  - On valid input: calls `getMockInvoiceStatus` → `formatInvoiceResponse` → appends closing message → `done: true`

### 3. UPDATE `src/lib/flows/billing/steps.ts`

Replace stub "coming soon" handler with a proper entry point:

- Returns friendly billing intro message
- Removes `done: true` so the engine can proceed to subroute classification

### 4. UPDATE `src/lib/flows/billing/flow.ts`

Add subroute definition:

- Import `handleAskInvoiceId` from `./subroutes/status`
- Add `subroutes: { status: { entryStep: "ask_invoice_id", steps: { ask_invoice_id: handleAskInvoiceId } } }`

## No Changes Needed

- `src/lib/flows/registry.ts` — already imports `billingFlow`
- `src/lib/llm/schemas.ts` — `billing` in `FLOW_VALUES`, `status` in `SUBROUTE_CONFIG`
- `src/lib/llm/prompts.ts` — billing keywords + examples already present
- Database schema — no new migrations required

## Conversation Flow

```
User: "quero ver minha fatura"
  → Global router: billing (confidence >= 0.80)
  → Engine: no active subroute → classifySubroute() → "status"
  → handleAskInvoiceId (1st call):
    Bot: "Para consultar sua fatura, preciso do número da nota fiscal ou do pedido.
          Pode me enviar?"

User: "INV-2026-12345"
  → handleAskInvoiceId (2nd call):
    → Validates: length >= 3 ✓
    → getMockInvoiceStatus("INV-2026-12345") → last digit '5' → pendente
    Bot: "Fatura #INV-2026-12345:
          📊 Status: Pendente
          💰 Valor: R$ 450,00
          📅 Vencimento: 20/02/2026
          ..."
    → done: true → session cleared
```

## Verification

1. `npm run build` — no TypeScript errors
2. `npm run lint` — no lint issues
3. Manual test: send "quero ver minha fatura" → should enter billing flow, ask for invoice ID, return mock status
4. Manual test: send short input (e.g., "12") → should get retry message
5. Manual test: send 3+ invalid inputs → should get human handoff message
