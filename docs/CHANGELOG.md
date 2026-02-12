# Changelog
All notable changes to this project will be documented in this file.

## Unreleased
### Added
- Webhook normalization: `contextInfo.quotedMessage` added to `extendedTextMessage` Zod schema (documents quoted reply structure in types)

### Fixed
- Webhook guards: empty/whitespace-only text messages now silently ignored (`empty_text` guard) instead of passing through to processing

## 2026-02-12

### Phase 4 — Routing Layer A: Topic Shift + Global Flow Selection
#### Added
- LLM Zod schemas (`src/lib/llm/schemas.ts`): `FLOW_VALUES` const array, `FlowType`, `GlobalRouterSchema`, confidence thresholds (`CONFIDENCE_ACCEPT=0.80`, `CONFIDENCE_CLARIFY=0.60`)
- Prompt templates (`src/lib/llm/prompts.ts`): Portuguese system/user prompts for global router and topic shift, `formatChatHistory()` helper
- Groq LLM client (`src/lib/llm/client.ts`): `callLlm()` with round-robin key rotation across `GROQ_API_KEYS`, automatic retry on 429 (next key), `response_format: json_object`, 8s timeout, structured logging (`llm_call`, `llm_rate_limited`, `llm_call_error`)
- Global flow classifier (`src/lib/llm/globalRouter.ts`): `classifyFlow()` — never throws, validates LLM JSON with Zod, returns `{ flow: "unknown", confidence: 0 }` fallback on any error
- Topic shift detector (`src/lib/llm/topicShift.ts`): `detectTopicShift()` — two-tier detection: Tier 1 rule-based keyword matching (accent-insensitive via NFD normalization) for instant classification, Tier 2 LLM fallback only when keywords inconclusive. Favors continuity on ambiguous results
- Routing orchestrator (`src/lib/routing/routeMessage.ts`): `routeMessage()` — loads chat history, routes new sessions via `classifyFlow` and existing sessions via `detectTopicShift`, upserts session state, sends placeholder reply per flow, persists outbound message (fire-and-forget). Never throws — top-level catch sends error message to user
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
- Webhook normalization (`src/lib/webhook/normalize.ts`): Zod schema for Evolution API v2 `messages.upsert` payload, `normalizeMessage()`, `applyGuards()` with guard chain (fromMe → group → @lid → message type)
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
