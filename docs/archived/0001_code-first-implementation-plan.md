# Complete and detailed plan (code-first implementation)

## Phase 0 — Bootstrap and repo skeleton
**Goal:** a clean TypeScript service with dev ergonomics.

- Pick framework: **Fastify** (structured + fast) or **Express** (simplest).
- Add:
  - TypeScript, ts-node-dev (or tsx)
  - ESLint + Prettier
  - Zod
  - dotenv
  - axios (or fetch)
- Add `CLAUDE.md` (above) + `README.md` with run instructions.
- Add `/health` endpoint.

**Exit criteria**
- `npm run dev` boots server
- `/health` returns OK

---

## Phase 1 — Supabase schema + repositories
**Goal:** reliable persistence for state, history, and idempotency.

- Create `migrations/001_init.sql`:
  - `conversation_state` (add `active_subroute`)
  - `chat_messages` + unique index on `message_id`
- Implement Supabase client with service role key.
- Implement repositories:
  - `getSession(userId)`
  - `upsertSession(session)`
  - `clearSession(userId)`
  - `insertInboundIfNew(message_id, ...)` → returns boolean (new vs duplicate)
  - `insertOutbound(...)`
  - `loadRecentMessages(userId, limit)`

**Exit criteria**
- Duplicate `message_id` is rejected/ignored
- Session upsert + TTL works

---

## Phase 2 — Webhook ingestion + normalization (Evolution)
**Goal:** transform raw webhook into a safe internal event.

- Build `POST /webhook/evolution`
- Normalize using your exact paths:
  - userId from `body.sender` (digits only)
  - messageId from `body.data.key.id`
  - fromMe from `body.data.key.fromMe`
  - text extraction from conversation/extendedText/captions
  - group check from `remoteJid.endsWith("@g.us")` (optional ignore)
- Add optional `WEBHOOK_SECRET` header validation.
- Log key metadata (userId, instance, messageId).

**Exit criteria**
- Your sample payload produces normalized event with correct `userId` + `text`

---

## Phase 3 — Processing pipeline (guards + dedupe + history)
**Goal:** safe, idempotent processing.

Order of operations per message:
1) Ignore `fromMe=true`
2) Optional ignore group
3) **Dedupe**: insert inbound message with unique `message_id`
4) Save inbound message text (if new)
5) Load session state

**Exit criteria**
- Retry storms don’t cause multiple replies

---

## Phase 4 — Routing layer A: topic shift + global flow selection
**Goal:** choose the correct top-level flow even mid-conversation.

Implement:
- **Rule-based interrupt detector** (cheap, fast):
  - keywords for billing/payment, certificate, human/attendant, etc.
- **LLM topic shift classifier** (only if ambiguous):
  - returns `{flow, confidence}`
  - if `confidence >= 0.80` switch flow + reset `active_subroute=null, step="start", data={}`

Also implement initial global routing for new sessions:
- If no active session or session expired:
  - LLM global router returns `flow`
  - if unknown/low confidence → ask a clarifying question

**Exit criteria**
- User can switch topics mid-flow reliably

---

## Phase 5 — Flow framework + deterministic step machine
**Goal:** a consistent way to implement flows/subroutes/steps.

Implement a standard handler signature, e.g.:

- `handleMessage({ state, text }) -> { reply, nextState, done }`

Where `nextState` includes:
- `active_flow`
- `active_subroute`
- `step`
- `data`

**Exit criteria**
- One flow can run multi-turn without LLM “driving” steps

---

## Phase 6 — Flow example: Digital Certificate (with subroutes)
**Goal:** implement the exact scenario you described.

**Flow:** `digital_certificate`  
**Subroutes (LLM decides):**
- `purchase`
- `support`
- `renewal`
- `status`
- `requirements`
- fallback: null → ask “Você quer comprar, renovar ou suporte?”

**Minimal steps per subroute (starter)**
- purchase:
  - `ask_person_type` → `ask_cpf` → `ask_email` → `confirm` → done
- support:
  - `ask_problem` → `ask_screenshot` (optional) → `confirm` → done
- renewal/status/requirements can be shorter.

Use in-flow LLM router when:
- `active_subroute` is null
- or user sends ambiguous input

**Exit criteria**
- “Oi” → “preciso de certificado digital” → routes into digital_certificate
- “quero comprar” → purchase steps start
- “estou com erro” → support steps start

---

## Phase 7 — Evolution outbound messaging client
**Goal:** reliable sending + observability.

- Implement `sendText(instance, number, text)` via Evolution endpoint.
- Retry policy:
  - retry on network/5xx a couple times
  - no retry on 4xx
- Persist outbound message to `chat_messages` after sending (or even before, if you want audit even on failure).

**Exit criteria**
- Replies are delivered and tracked

---

## Phase 8 — LLM implementation (providers + schemas + prompts)
**Goal:** stable JSON outputs and safe fallbacks.

- Centralize:
  - prompts (global router, topic shift, per-flow subroute router, extraction)
  - Zod schemas for each response
  - parsing + fallback behavior
- Set `temperature=0`.
- Always validate:
  - invalid JSON → fallback
  - low confidence → clarifying question / human flow

**Exit criteria**
- Router never crashes on weird LLM output

---

## Phase 9 — Remaining flows
Implement more top-level flows as needed:
- `billing` (payment status, invoice, refund)
- `general_support` (generic)
- `sales` (pricing, onboarding)
- `human` (handoff instructions)

Each should follow the same pattern:
- optional subroute
- deterministic steps
- TTL-based session cleanup

---

## Phase 10 — Operational hardening
**Goal:** production readiness.

- Add:
  - structured logs (correlation id per webhook)
  - rate limiting (per userId)
  - PII-safe logging (don’t log full message content in prod)
  - a “reset” command: user sends “cancelar/reiniciar” → clear session
- Consider a queue (BullMQ/Redis) if volume increases.

---

## Phase 11 — Tests + end-to-end verification
**Unit tests**
- normalize payload (use your sample)
- dedupe behavior
- state transitions for digital_certificate
- LLM JSON parsing/validation

**Integration tests**
- webhook → supabase writes → sendText called (mock evolution)

**Manual acceptance**
- fromMe ignored
- duplicate message ignored
- topic shift works
- subroute routing works
