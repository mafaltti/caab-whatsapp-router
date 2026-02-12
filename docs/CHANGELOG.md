# Changelog
All notable changes to this project will be documented in this file.

## Unreleased

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
