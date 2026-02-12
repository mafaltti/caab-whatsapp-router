# Phase 4 — Routing Layer A: Topic Shift + Global Flow Selection

## Context

Phases 1–3 are complete: the webhook pipeline receives Evolution API messages, normalizes payloads, applies guards (`fromMe`, groups, media), deduplicates by `message_id`, and loads session state. There's a TODO at `src/app/api/webhook/evolution/route.ts:150` where routing should happen. This phase fills that gap by introducing the Groq LLM client and the first routing logic — determining which top-level flow a user belongs to, even mid-conversation.

**What this phase does NOT include:** flow step execution, subroute routing, or data extraction (those are Phase 5+). After routing, a temporary placeholder reply is sent until the flow framework exists.

---

## Files to Create (in order)

### 1) `src/lib/llm/schemas.ts` — Zod schemas + flow constants

- Define `FLOW_VALUES` const array: `["digital_certificate", "billing", "general_support", "unknown"]`
- Export `FlowType` type derived from that array
- `GlobalRouterSchema` — Zod object:
  - `{ flow, confidence (0-1), reason (max 200 chars) }`
- Export confidence thresholds:
  - `CONFIDENCE_ACCEPT = 0.80`
  - `CONFIDENCE_CLARIFY = 0.60`
- Use `zod/v4` import (matches existing convention in `normalize.ts`)

### 2) `src/lib/llm/prompts.ts` — Prompt templates

- `formatChatHistory(messages: ChatMessage[])` — helper to format history as `Usuário: ... / Assistente: ...`
- `globalRouterSystemPrompt()` — Portuguese system prompt with flow descriptions, rules, few-shot examples, strict JSON instruction
- `globalRouterUserPrompt(text, chatHistory)` — includes history + current message
- `topicShiftSystemPrompt()` — similar but instructs to favor continuity when ambiguous
- `topicShiftUserPrompt(text, currentFlow, chatHistory)` — includes current flow context
- Pure functions, no side effects
- Reuses `ChatMessage` from `@/lib/db`

### 3) `src/lib/llm/client.ts` — Groq client with key rotation

- Uses `groq-sdk` (already installed)
- `callLlm({ systemPrompt, userPrompt, correlationId?, maxTokens?, temperature? })`
  → `{ content, durationMs, model, tokensUsed? }`
- Key rotation:
  - Reads `GROQ_API_KEYS` env var
  - Splits by comma
  - Round-robin via module-level index
- On `RateLimitError` (429):
  - Immediately try next key
  - Up to `keys.length` total attempts
- Defaults:
  - Model: `llama-3.3-70b-versatile`
  - `temperature: 0`
  - `max_tokens: 500`
  - `timeout: 8s`
- Uses `response_format: { type: "json_object" }` for better JSON compliance
- `maxRetries: 0` on the Groq client (we handle retries ourselves)
- Structured logging:
  - `llm_call` on success
  - `llm_rate_limited` on 429
  - `llm_call_error` on failure

### 4) `src/lib/llm/globalRouter.ts` — LLM flow classification

- `classifyFlow({ text, chatHistory, correlationId }) → GlobalRouterResult`
- Never throws:
  - Catches all errors internally and returns fallback:
    - `{ flow: "unknown", confidence: 0, reason: "Fallback" }`
- Calls `callLlm` → parses JSON → validates with `GlobalRouterSchema.safeParse()`
- On invalid JSON or schema failure:
  - Logs warning
  - Returns fallback

### 5) `src/lib/llm/topicShift.ts` — Two-tier topic shift detection

- `detectTopicShift({ text, currentFlow, chatHistory, correlationId }) → GlobalRouterResult | null`

#### Tier 1 — Rule-based keywords (fast, no LLM cost)

- `digital_certificate`: `"certificado digital"`, `"e-cpf"`, `"e-cnpj"`, `"certificado a1"`, `"certificado a3"`, etc.
- `billing`: `"boleto"`, `"fatura"`, `"pagamento"`, `"cobrança"`, `"nota fiscal"`, `"segunda via"`, etc.
- `general_support`: `"atendente"`, `"humano"`, `"falar com alguém"`, `"suporte"`, etc.
- Accent-insensitive matching via Unicode NFD normalization
- If keyword matches current flow → return `null` (no shift)
- If keyword matches different flow → return result with confidence `0.95`

#### Tier 2 — LLM fallback (only if keywords inconclusive)

- Calls `classifyFlow()` with topic-shift-aware prompt
- Only switches if:
  - `flow !== currentFlow`
  - `flow !== "unknown"`
  - `confidence >= 0.80`
- Otherwise returns `null` (stay in current flow, favor continuity)

- Never throws — inherits `classifyFlow`’s fallback behavior

### 6) `src/lib/llm/index.ts` — Barrel exports

- Exports all public functions and types from the above files

### 7) `src/lib/routing/routeMessage.ts` — Orchestrator

- `routeMessage({ message, session, correlationId }) → Promise<void>`
- Never throws:
  - Top-level try/catch sends error message to user on failure

#### Logic

a. Load recent chat history (`loadRecentMessages`, 5 messages)  
b. If session has active flow: run `detectTopicShift`
- Shift detected → set new flow, reset subroute/step/data
- No shift → keep current flow (Phase 4 sends placeholder; Phase 5 replaces with step execution)

c. If no session (new/expired): run `classifyFlow`
- `confidence >= 0.80` → accept flow
- `0.60–0.79` → set `"unknown"`, ask clarifying question
- `< 0.60` → set `"unknown"`, show generic menu

d. Upsert session with determined flow  
e. Send reply via `sendText`  
f. Persist outbound message via `insertOutbound` (fire-and-forget)

#### Temporary reply messages per flow (replaced in Phase 5)

- `digital_certificate`: `"Entendi que você precisa de ajuda com certificado digital! ..."`
- `billing`: `"Entendi que você precisa de ajuda com faturamento! ..."`
- `general_support`: `"Entendi que você precisa de suporte! ..."`
- `unknown`: `"Olá! Como posso te ajudar? Trabalho com certificado digital, faturamento e suporte geral."`
- Clarification: `"Desculpe, não tenho certeza do que você precisa. Pode me dizer com mais detalhes?"`
- Topic switch prefix: `"Entendi, vamos mudar de assunto. "`

#### Logging

- `flow_transition`, `flow_continued` events with `correlation_id`

### 8) `src/lib/routing/index.ts` — Barrel export

### 9) Update `src/app/api/webhook/evolution/route.ts`

- Add import:
  - `import { routeMessage } from "@/lib/routing"`
- Replace lines 150–152 (the TODO comments) with:
  - `await routeMessage({ message, session, correlationId });`
- Everything else stays the same — HTTP 200 is always returned

---

## Key Design Decisions

1. **Rule-based before LLM:** Keywords catch 60%+ of topic shifts without LLM cost or latency  
2. **Never-throw pattern:** `classifyFlow` and `detectTopicShift` always return a safe value; the orchestrator has a top-level catch for unexpected errors  
3. **Favor continuity:** When ambiguous during topic shift, stay in current flow (reduces false positives)  
4. **Placeholder replies:** Phase 4 sends static messages; Phase 5 replaces the `routeMessage` “continue” branch with flow step execution  
5. **Accent-insensitive keywords:** NFD normalize + strip combining marks handles `"cobrança"`/`"cobranca"` etc.  
6. **groq-sdk over raw fetch:** Already installed, handles auth headers, provides typed error classes (`RateLimitError`)  

---

## Verification

1. `npm run build` — no TypeScript errors  
2. Send `"Oi"` via WhatsApp → should reply with unknown/generic greeting, session created with `flow="unknown"`  
3. Send `"Preciso de certificado digital"` → should classify as `digital_certificate` (LLM), reply with certificate greeting  
4. Send `"Quero ver meu boleto"` → should hit keyword for billing (no LLM call needed), reply with billing greeting  
5. While in `digital_certificate`, send `"Quero ver meu boleto"` → keyword detects topic shift to billing  
6. While in billing, send `"Sim, quero pagar"` → no topic shift detected (stays in billing)  
7. Disconnect Groq (invalid keys) → should fallback to unknown flow with generic greeting, no crash  
8. Check Vercel/stdout logs for structured JSON events:
   - `llm_call`
   - `flow_transition`
   - `topic_shift_keyword_detected`
