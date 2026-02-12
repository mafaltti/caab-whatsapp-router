# Changelog
All notable changes to this project will be documented in this file.

## Unreleased

### Conversational Unknown Flow
#### Changed
- Unknown flow steps (`src/lib/flows/unknown/steps.ts`): replaced static numbered menu with free-form LLM conversational loop. `handleStart` calls conversational LLM + `classifyFlow()` — if a non-unknown flow is detected (>= 0.80 confidence), hands off immediately via `_handoff_flow` convention; otherwise replies naturally and transitions to `awaiting_reply`. `handleAwaitingReply` repeats the dual-call pattern each turn; after 5 turns without resolving intent, falls back to the static menu. LLM failures at any point gracefully degrade to the static menu with `done: true`
- Unknown flow definition (`src/lib/flows/unknown/flow.ts`): registered `awaiting_reply` step alongside `start`
- Routing orchestrator (`src/lib/routing/routeMessage.ts`): added `_handoff_flow` convention — after `executeFlow()` returns, checks `nextState.data._handoff_flow`; if present, re-executes with the target flow in the same message cycle so the user seamlessly enters the new flow without repeating themselves. Reply from the unknown flow is concatenated with the handoff flow's reply

#### Added
- Conversational prompts (`src/lib/llm/prompts.ts`): `unknownConversationSystemPrompt()` (Portuguese, instructs LLM to act as friendly CAAB WhatsApp assistant, keep replies short, never mention being AI, return JSON `{"reply": "..."}`) and `unknownConversationUserPrompt(text, chatHistory, turnCount)`
- Turn count context: `unknownConversationUserPrompt` now includes `Turno da conversa: N` so the LLM knows how far into the conversation it is. System prompt rule 6 instructs the LLM to be more direct and mention available services naturally on later turns

#### Fixed
- Routing orchestrator (`src/lib/routing/routeMessage.ts`): skip topic shift detection when `activeFlow === "unknown"` — the unknown flow already handles its own intent classification via `classifyFlow()` inside step handlers; running the topic shift detector on top caused false positives on ambiguous/conversational messages (e.g. casual greetings misclassified as `general_support`)
- Routing orchestrator (`src/lib/routing/routeMessage.ts`): on `_handoff_flow`, replace the reply with the target flow's reply instead of concatenating — the conversational LLM reply becomes stale once intent is classified, so showing both produced contradictory messages (e.g. "Posso ajudar com algo?" followed by "Entendi que você precisa de suporte")

### Phase 6 — Digital Certificate Flow Implementation
#### Added
- Field validators (`src/lib/flows/digitalCertificate/validation.ts`): `isValidCpf` (11 digits, not all same), `isValidCnpj` (14 digits, not all same), `isValidCpfCnpj` (dispatches by person type), `isValidEmail` (@ with domain), `isValidPhone` (10–11 digits). MVP length checks only — no mathematical check-digit validation
- Flow helpers (`src/lib/flows/digitalCertificate/helpers.ts`): `generateProtocolId()` (format `CD-YYYYMMDD-XXXX`), retry tracking (`getRetryCount`, `incrementRetry`, `isMaxRetriesReached` — max 3 retries via `data.{field}_retry_count` keys), `HUMAN_HANDOFF_REPLY` constant, `detectConfirmation()` (rule-based yes/no/unclear from Portuguese keywords), `detectFieldToCorrect()` (keyword + numeric 1–4 selection), `FIELD_TO_STEP` mapping, formatting functions (`formatPurchaseSummary`, `formatRenewalSummary`, `formatSupportSummary`) with CPF/CNPJ/phone masking
- Purchase subroute (`src/lib/flows/digitalCertificate/subroutes/purchase.ts`): 6 step handlers — `ask_person_type` → `ask_cpf_cnpj` → `ask_email` → `ask_phone` → `confirm` → `ask_correction`. Uses `_asked_X` sentinel pattern to distinguish "asking the question" vs "processing the answer" on entry step's first call. Correction flow: `confirm` "não" → `ask_correction` detects field → clears old value + sets `_correcting: true` → re-asks that step → on success routes back to `confirm` instead of continuing forward. Each extraction step retries up to 3 times before human handoff
- Renewal subroute (`src/lib/flows/digitalCertificate/subroutes/renewal.ts`): 3 step handlers — `ask_order_id` → `ask_email` → `confirm`. Order ID validated by length (>= 3 chars). Confirm "não" restarts the subroute from the beginning
- Support subroute (`src/lib/flows/digitalCertificate/subroutes/support.ts`): 3 step handlers — `ask_problem` → `ask_order_id` → `confirm`. Problem description requires min 5 chars. Order ID is optional (user can reply "não" to skip). Confirm generates protocol + "técnico entrará em contato" message
- Requirements subroute (`src/lib/flows/digitalCertificate/subroutes/requirements.ts`): 2 step handlers — `show_info` (displays PF and PJ document requirements) → `offer_purchase` (yes → ends session so next message triggers fresh subroute classification into purchase; no → goodbye + `done: true`)
- Status subroute (`src/lib/flows/digitalCertificate/subroutes/status.ts`): 1 step handler — `ask_order_id` collects order ID then calls `getMockOrderStatus()` which varies response by last digit (0–3: Em processamento, 4–6: Aguardando validação, 7–9: Concluído). Returns `done: true`

#### Changed
- Digital certificate flow definition (`src/lib/flows/digitalCertificate/flow.ts`): replaced stub with full `FlowDefinition` wiring all 5 subroutes (purchase, renewal, support, requirements, status) with their entry steps and step handler maps. No changes to registry — it already imports `digitalCertificateFlow`
- `handleStart` step (`src/lib/flows/digitalCertificate/steps.ts`): replaced "coming soon" placeholder with helpful prompt listing the 5 available options (comprar, renovar, status, requisitos, suporte). Removed `done: true` so session stays active for subroute classification on next message

### Phase 5 — Flow Framework + Deterministic Step Machine
#### Added
- Flow type system (`src/lib/flows/types.ts`): `FlowContext`, `StepResult`, `StepHandler`, `FlowSubrouteDefinition`, `FlowDefinition`, `FlowExecutionResult` interfaces. Steps return declarative `StepResult` (reply, nextStep, partial data merge, done flag) — engine handles state transitions
- Flow execution engine (`src/lib/flows/engine.ts`): `executeFlow()` — looks up flow from registry, runs subroute classification (via `classifySubroute`) when flow has populated subroutes and no active subroute, resolves step handler from subroute or top-level steps, executes with try/catch, logs `step_executed` transitions. On missing flow/step → error reply + `done: true`. On handler exception → preserves current state
- Flow registry (`src/lib/flows/registry.ts`): `getFlowDefinition()` maps flow IDs to definitions. Registers all 4 flows: unknown, general_support, digital_certificate, billing
- Unknown flow (`src/lib/flows/unknown/`): single `start` step showing numbered menu (Certificado Digital / Faturamento / Suporte Geral), returns `done: true` to clear session so next message triggers fresh global routing
- General support flow (`src/lib/flows/generalSupport/`): **multi-turn proof** — 2 deterministic steps without LLM driving: `start` asks user to describe problem → `awaiting_problem` captures text, confirms handoff with problem summary, stores `{ problem, handoff_at }` in session data, returns `done: true`
- Digital certificate stub flow (`src/lib/flows/digitalCertificate/`): single `start` step with placeholder message + `done: true`. No subroutes defined yet (engine skips subroute classification). Phase 6 will add subroute definitions
- Billing stub flow (`src/lib/flows/billing/`): single `start` step with placeholder message + `done: true`. Phase 9 will add subroute definitions
- Barrel export (`src/lib/flows/index.ts`): exports `executeFlow`, `getFlowDefinition`, and all flow types

#### Changed
- Routing orchestrator (`src/lib/routing/routeMessage.ts`): replaced static `FLOW_REPLIES` map, `TOPIC_SWITCH_PREFIX`, and `CLARIFY_REPLY` constants with `executeFlow()` calls across all 3 scenarios (continue flow, topic shift, new/expired session). Session persistence now branches: `done: true` → `clearSession()`, else `upsertSession()` with engine's `nextState` (activeFlow, activeSubroute, step, data)

#### Removed
- `FLOW_REPLIES` constant — replaced by per-flow step handlers
- `TOPIC_SWITCH_PREFIX` constant — inlined in topic shift branch
- `CLARIFY_REPLY` constant — replaced by unknown flow menu
- `src/lib/flows/.gitkeep` placeholder

### Phase 4.5 — LLM Layer B & C: Subroute Router + Data Extractors
#### Added
- Subroute router (`src/lib/llm/subrouteRouter.ts`): `classifySubroute()` with 5-stage validation pipeline (config check, LLM call, JSON parse, Zod schema, valid subroute ID). Returns discriminated union `ClassifySubrouteResult`. Generic design — flow-specific subroutes configured via `SUBROUTE_CONFIG` map
- Data extractors (`src/lib/llm/extractors.ts`): Generic `extractWithLlm<T>()` helper eliminates duplicated try/catch/parse/validate boilerplate. 5 extraction functions: `extractPersonType`, `extractCpfCnpj` (with `expectedType` parameter for PF/PJ-aware digit count), `extractEmail`, `extractPhone`, `extractData` (combined multi-field)
- Subroute Zod schema (`SubrouteRouterSchema`): validates `{ subroute, confidence, reason }`
- Combined data extraction schema (`DataExtractionSchema`): validates `{ person_type, cpf_cnpj, email, phone, confidence, missing_fields }` with digits-only regex for CPF/CNPJ and phone
- Individual extraction schemas: `PersonTypeExtractionSchema`, `CpfCnpjExtractionSchema`, `EmailExtractionSchema`, `PhoneExtractionSchema` — each with digits-only regex or `z.string().email()` as appropriate
- Subroute configuration map (`SUBROUTE_CONFIG`): `digital_certificate` (5 subroutes: purchase, renewal, support, requirements, status), `billing` (1 subroute: status)
- `SubrouteDefinition` interface for type-safe subroute config
- 12 prompt functions in `prompts.ts`: subroute router (system/user), combined data extraction (system/user), individual extraction prompts for person type, CPF/CNPJ, email, phone (system/user each). All prompts in Portuguese with few-shot examples
- Barrel exports for all new schemas, types, and functions from `src/lib/llm/index.ts`

### Added
- Webhook normalization: `contextInfo.quotedMessage` added to `extendedTextMessage` Zod schema (documents quoted reply structure in types)

### Changed
- Global flow classifier (`src/lib/llm/globalRouter.ts`): `classifyFlow()` now returns a discriminated union `ClassifyFlowResult` (`{ ok: true, data }` | `{ ok: false, errorType }`) instead of masking errors as low-confidence fallbacks. Error types: `llm_error`, `invalid_json`, `schema_validation`
- Exported `ClassifyFlowResult` type from `src/lib/llm/index.ts`
- Routing orchestrator (`src/lib/routing/routeMessage.ts`): handles `classifyFlow` errors distinctly — `llm_error` sends spec-mandated technical difficulties message; `invalid_json`/`schema_validation` sends spec-mandated reformulation message. No session upsert on broken classifications
- Webhook route (`src/app/api/webhook/evolution/route.ts`): heavy processing (dedupe, session load, routing, LLM, API calls) deferred via Next.js 15 `after()` — webhook returns 200 immediately after lightweight validation, eliminating timeout risk

### Fixed
- Webhook guards: empty/whitespace-only text messages now silently ignored (`empty_text` guard) instead of passing through to processing
- LLM failures no longer silently masked as low-confidence classifications — Groq outages now surface the correct error message to users instead of a confusing greeting
- Invalid JSON / schema validation from LLM now returns the spec-mandated fallback message (`"Desculpe, não entendi. Pode reformular sua mensagem?"`) instead of routing to unknown flow
- Outbound message persistence errors now logged with `outbound_persist_error` event, correlation ID, user ID, and instance (previously swallowed silently)
- `userId` normalized to digits-only via `.replace(/\D/g, "")` after JID split, with early return on empty result

### Removed
- Dead `@lid` guard in `applyGuards()` — already covered by `isGroup` guard

## 2026-02-12

### Phase 4 — Routing Layer A: Topic Shift + Global Flow Selection
#### Added
- LLM Zod schemas (`src/lib/llm/schemas.ts`): `FLOW_VALUES` const array, `FlowType`, `GlobalRouterSchema`, confidence thresholds (`CONFIDENCE_ACCEPT=0.80`, `CONFIDENCE_CLARIFY=0.60`)
- Prompt templates (`src/lib/llm/prompts.ts`): Portuguese system/user prompts for global router and topic shift, `formatChatHistory()` helper
- Groq LLM client (`src/lib/llm/client.ts`): `callLlm()` with round-robin key rotation across `GROQ_API_KEYS`, automatic retry on 429 (next key), `response_format: json_object`, 8s timeout, structured logging (`llm_call`, `llm_rate_limited`, `llm_call_error`)
- Global flow classifier (`src/lib/llm/globalRouter.ts`): `classifyFlow()` — validates LLM JSON with Zod, returns discriminated union result (see Unreleased for updated error handling)
- Topic shift detector (`src/lib/llm/topicShift.ts`): `detectTopicShift()` — two-tier detection: Tier 1 rule-based keyword matching (accent-insensitive via NFD normalization) for instant classification, Tier 2 LLM fallback only when keywords inconclusive. Favors continuity on ambiguous results
- Routing orchestrator (`src/lib/routing/routeMessage.ts`): `routeMessage()` — loads chat history, routes new sessions via `classifyFlow` and existing sessions via `detectTopicShift`, upserts session state, sends placeholder reply per flow, persists outbound message (fire-and-forget). Top-level catch sends error message to user (see Unreleased for updated error handling)
- Barrel exports for `llm` and `routing` modules

#### Changed
- Webhook route (`src/app/api/webhook/evolution/route.ts`): replaced Phase 4/5 TODO stubs with `await routeMessage({ message, session, correlationId })`

### Phase 3 — Processing Pipeline (Dedupe + Session Load)
#### Changed
- Webhook route (`src/app/api/webhook/evolution/route.ts`): wired `insertInboundIfNew` for message deduplication (duplicate webhooks return 200 with no further processing) and `getSession` for session loading (handles expired sessions as new users). All DB errors return 200 to prevent Evolution retry storms. Added `performance.now()` duration tracking for DB latency monitoring.

### Phase 2 — Webhook Endpoint + Evolution API Normalization
#### Added
- Shared types (`src/lib/shared/types.ts`): `NormalizedMessage` and `GuardResult` interfaces
- Structured JSON logger (`src/lib/shared/logger.ts`): `generateCorrelationId()`, level-gated `logger.debug/info/warn/error()` respecting `LOG_LEVEL` env var
- Evolution API client (`src/lib/evolution/client.ts`): `sendText()` with 5s timeout, lazy env validation for Next.js build compatibility
- Webhook normalization (`src/lib/webhook/normalize.ts`): Zod schema for Evolution API v2 `messages.upsert` payload, `normalizeMessage()`, `applyGuards()` with guard chain (fromMe → group → message type)
- Barrel exports for `shared`, `evolution`, and `webhook` modules

#### Changed
- Webhook route (`src/app/api/webhook/evolution/route.ts`): replaced stub with full POST handler — correlation ID, JSON parsing, normalization, guard checks, fire-and-forget auto-reply for media messages, TODO stubs for Phase 3+

### Phase 1 — Supabase Schema + Repositories
#### Added
- Database migration (`20260212051650_init.sql`): `conversation_state` and `chat_messages` tables with partial unique index for message dedup
- Seed data (`supabase/seed.sql`): 3 test users (active, active, expired) with chat messages and dedup test fixtures
- Supabase client (`src/lib/db/supabase.ts`): singleton with service role key, auth disabled
- Session repository (`src/lib/db/sessionRepo.ts`): `getSession` (with expiry check), `upsertSession` (TTL refresh), `clearSession`
- Message repository (`src/lib/db/messageRepo.ts`): `insertInboundIfNew` (dedup via unique violation), `insertOutbound`, `loadRecentMessages`
- Barrel export (`src/lib/db/index.ts`)

#### Changed
- Regenerated `src/lib/db/types.ts` with full table definitions

### Phase 0.5 — Multi-Environment CI/CD Setup
#### Changed
- CI workflow (`ci.yml`): use `supabase db start` instead of `supabase start` (faster in CI)
- CI workflow: add `workflow_dispatch` trigger for manual runs
- CI workflow: show `git diff` output on type check failure for debugging
- Staging workflow (`staging.yml`): add `workflow_dispatch`, concurrency group, `SUPABASE_PROJECT_ID` env var
- Production workflow (`production.yml`): add `workflow_dispatch`, concurrency group, `SUPABASE_PROJECT_ID` env var

#### Removed
- Deleted stale `nul` file (Windows artifact)

### Phase 0 — Project Bootstrap
#### Added
- Next.js 15.3 with TypeScript and ESLint configuration
- Health check endpoint (`GET /api/health`)
- Evolution webhook stub (`POST /api/webhook/evolution`)
- Supabase CLI initialization (`supabase/config.toml`)
- Baseline Supabase TypeScript types (`src/lib/db/types.ts`)
- Library directory structure with placeholders (`db`, `evolution`, `flows`, `llm`, `shared`, `webhook`)
- GitHub Actions CI/CD workflows (`ci.yml`, `staging.yml`, `production.yml`)
- Environment variable template (`.env.example`)
- `nul` added to `.gitignore` (Windows artifact prevention)
- Documentation moved to `docs/` directory, old decision records archived to `docs/archived/`
- Initial project documentation (ARCHITECTURE, ENVIRONMENT, FLOWS, PLAN)
