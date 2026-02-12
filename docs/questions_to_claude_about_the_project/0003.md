# WhatsApp Assistant — Flows & Orchestrator Overview

## QUESTION: List all flows

● Read 1 file *(ctrl+o to expand)*

● 4 registered flows:

| Flow                | ID                    | Status                                                   |
| ------------------- | --------------------- | -------------------------------------------------------- |
| Unknown             | `unknown`             | Conversational loop with LLM + fallback menu             |
| Digital Certificate | `digital_certificate` | Fully implemented (5 subroutes, multi-step collection)   |
| Billing             | `billing`             | Stub — placeholder message, ends immediately             |
| General Support     | `general_support`     | Minimal — captures problem description, then ends        |

## QUESTION: Explain "Digital Certificates" flow

● *Explore(Explore digital certificate flow)*
⎿ Done (10 tool uses · 33.2k tokens · 44s)

● The Digital Certificate flow (`digital_certificate`) is the most complete flow in the system. Here's the overview:

### Entry Point

A start step presents a menu. The LLM subroute classifier then routes to one of 5 subroutes.

### 5 Subroutes

#### 1. Purchase (`purchase`) — Full data collection

`ask_person_type` → `ask_cpf_cnpj` → `ask_email` → `ask_phone` → `confirm` → `ask_correction`

Collects PF/PJ type, CPF or CNPJ, email, and phone. Each field uses LLM extraction from free-form text + validation. On confirm, user can say "não" to correct a specific field (by number 1-4 or keyword), then return to confirm. On "sim", generates a protocol ID (`CD-YYYYMMDD-XXXX`).

#### 2. Renewal (`renewal`) — Order + email

`ask_order_id` → `ask_email` → `confirm`

Collects previous order/protocol number (plain text, min 3 chars) and email. On rejection, resets both fields and restarts.

#### 3. Support (`support`) — Problem capture

`ask_problem` → `ask_order_id` → `confirm`

Collects free-form problem description (min 5 chars) and optionally an order ID (user can skip). Generates a support ticket protocol.

#### 4. Requirements (`requirements`) — Informational

`show_info` → `offer_purchase`

Displays required documents for PF (e-CPF) and PJ (e-CNPJ), then offers to start a purchase.

#### 5. Status (`status`) — Lookup

`ask_order_id` → `done`

Asks for order/protocol number and returns a mock status based on last digit (processing / awaiting validation / completed). Read-only, ends immediately.

### Shared Mechanics

- **LLM extractors:** `extractPersonType`, `extractCpfCnpj`, `extractEmail`, `extractPhone` — all validated with Zod, require >= 0.80 confidence
- **Retry tracking:** Max 3 retries per field via `_retry_count` keys in state data, then human handoff
- **`_asked_X` sentinel pattern:** Distinguishes "asking the question" from "processing the answer" on first call
- **Validation:** MVP length checks only (no check-digit math for CPF/CNPJ)
- **Protocol ID:** Format `CD-YYYYMMDD-XXXX` (random 4-char hex)

*✻ Sautéed for 1m 5s*

## QUESTION: And there is orchestrator?

● Yes, the orchestrator is `src/lib/routing/routeMessage.ts`. It's the central function that handles every incoming message. Here's the flow:

`Webhook` → `normalize` → `guards` → `dedupe` → `routeMessage()`

### `routeMessage()` Decision Logic

#### 1. Existing session with active flow

- If `activeFlow === "unknown"` → skip topic shift, go straight to the flow's step handler
- Otherwise → run `detectTopicShift()` LLM classifier
  - Shift detected → switch flow, reset to start, prepend "Entendi, vamos mudar de assunto."
  - No shift → continue current flow/step

#### 2. No session (new or expired)

- Run `classifyFlow()` LLM classifier on the message
- Confidence >= 0.80 → route to that flow
- Below 0.80 → route to `unknown`

#### 3. After flow execution

- Check for `_handoff_flow` in result data → if present, re-execute with target flow (seamless transition from `unknown`)
- If `done: true` → clear session
- Otherwise → upsert session with updated state + 30min TTL
- Send reply via Evolution API
- Persist outbound message to `chat_messages`

### Flow Execution

The actual step execution is delegated to `src/lib/flows/engine.ts` (`executeFlow`), which resolves the flow definition, handles subroute classification if needed, and runs the step handler.

## QUESTION: What is `_handoff_flow`

● It's a convention we created in this session. Since `StepResult` can't change `activeFlow` directly (only the orchestrator can), the `unknown` flow's step handler stores `_handoff_flow` in the result data when `classifyFlow()` detects a non-unknown intent.

After `executeFlow()` returns, `routeMessage.ts` checks for it:

```
Unknown flow step detects intent
  → returns { data: { _handoff_flow: "digital_certificate" }, done: false }
    → routeMessage sees _handoff_flow
      → calls executeFlow() again with the target flow at step "start"
        → replaces the reply with the target flow's response
```

This way the user says "Preciso de certificado digital" during the `unknown` conversation, and in the same message cycle they get the digital certificate flow's first step — no need to repeat themselves.
