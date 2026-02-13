# CAAB WhatsApp Router

Webhook-driven WhatsApp assistant: Evolution API v2 + Supabase + Groq LLM + state machine.
Next.js 15 (App Router) on Vercel, TypeScript, Zod v4.

## Commands
- `npm run dev` / `npm run build` / `npm run lint`
- `supabase start` / `supabase stop` — local Postgres via Docker
- `supabase db reset` — wipe + reapply migrations + seed
- `supabase gen types typescript --local > src/lib/db/types.ts` — regenerate after schema changes

## Key Directories
- `src/app/api/webhook/evolution/` — webhook entry point (POST)
- `src/lib/db/` — Supabase client, session + message repos, generated types
- `src/lib/llm/` — Groq client, prompts, Zod schemas, routers, extractors
- `src/lib/flows/` — flow engine, registry, per-flow definitions (unknown, digitalCertificate, billing, generalSupport)
- `src/lib/routing/` — routeMessage orchestrator (load session → route → execute → persist → reply)
- `src/lib/evolution/` — sendText client
- `src/lib/webhook/` — payload normalization + guards
- `src/lib/shared/` — logger, types, utilities
- `supabase/migrations/` — SQL schema migrations
- `docs/` — ARCHITECTURE.md, FLOWS.md, ENVIRONMENT.md, PLAN.md

## Non-Negotiable Rules
1. **Ignore outgoing messages**: `data.key.fromMe === true` → return early. Prevents loops.
2. **Deduplicate**: `data.key.id` as `message_id`, enforced by DB unique constraint. Ignore `@lid` remoteJids.
3. **Persist state on every message**: all session state in Supabase, never in memory.
4. **LLM output = JSON + Zod validated** for all classification/extraction calls (jsonMode: true default). Exception: conversational replies use jsonMode: false (plain text).
5. **LLM never triggers side-effects**: LLM classifies/extracts; code decides next step, writes DB, calls APIs.
6. **Secrets from env vars only**: never hardcode keys or URLs.
7. **No PII in logs**: never log message content, CPF/CNPJ, email, or phone.

## Architecture Quick Reference

### Message Pipeline
Webhook → normalize → guards (fromMe, groups, media) → dedupe → load session → route → execute flow → persist state → send reply → save outbound

### Three Routing Layers
- **Layer A (Global/Topic-Shift)**: classifyFlow() or detectTopicShift() → picks active_flow
- **Layer B (Subroute)**: classifySubroute() → picks active_subroute within a flow
- **Layer C (Extraction)**: LLM extracts structured data (CPF, email, phone) in step handlers

### Confidence Thresholds (defined in src/lib/llm/schemas.ts)
- >= 0.80: accept classification
- 0.60–0.79: ask clarifying question
- < 0.60: route to unknown

### Unknown Flow (Conversational)
NOT a static menu. Uses LLM in text mode (jsonMode: false) for natural conversation. When intent is detected, sets `_handoff_flow` in step data; routeMessage handles seamless handoff to target flow.

### Topic Shift
Skipped when active_flow is "unknown" — the unknown flow handles intent classification internally.

## LLM Conventions
- **Provider**: Groq — **Model**: `openai/gpt-oss-120b` (see src/lib/llm/client.ts)
- **JSON mode** (jsonMode: true): default. Responses validated with Zod before use.
- **Text mode** (jsonMode: false): conversational replies only (unknown flow).
- **Key rotation**: round-robin through GROQ_API_KEYS env var, auto-retry on 429.
- **Temperature**: 0 — **Max tokens**: 500 — **Timeout**: 8s
- **On invalid JSON**: log error, fall back to "unknown" flow, ask user to rephrase.
- Prompts: `src/lib/llm/prompts.ts` — Schemas: `src/lib/llm/schemas.ts`

## Key Patterns

### Step Handler
`StepHandler = (ctx: FlowContext) => Promise<StepResult>`
Returns: `{ reply, nextStep, data?, done? }`. Flows define steps as `Record<string, StepHandler>`. Subroutes add `{ entryStep, steps }`.

### Session Lifecycle
TTL: 30 min (expires_at). Expired sessions treated as new (no "session expired" message). `done: true` → clear session. `done: false` → upsert with refreshed TTL.

### Flow Versioning
Each `FlowDefinition` has `version` (e.g. `"v1"`) and `active: boolean`. The registry is a flat array; `getFlowDefinition(flowId)` returns the active version (or an env-overridden version). Set `FLOW_VERSION_OVERRIDES=digital_certificate=v1` to pin a flow to a specific version at runtime. Flow files live in `src/lib/flows/<name>/v1/`. To add v2: create `v2/` alongside `v1/`, set `active: true` on v2 and `active: false` on v1, register both in `registry.ts`.

### Adding a Flow
Create definition in `src/lib/flows/<name>/v1/`, register in `registry.ts`, add flow ID to `FLOW_VALUES` in `schemas.ts`.

## Coding Guidance
- **Implementation order**: DB migration → regen types → repo layer → flow/step handlers → LLM prompts/schemas → wire into routing.
- Keep changes small, testable, commit frequently.
- Import Zod as `import { z } from "zod/v4"` (not `from "zod"`).
- All user-facing text is in Brazilian Portuguese.
- Rate limiting is NOT yet implemented (planned).

## References
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system diagram, DB schema, CI/CD, deployment
- [docs/FLOWS.md](docs/FLOWS.md) — flow specs, subroute steps, validation, templates
- [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) — setup guide, env vars, troubleshooting
- [CHANGELOG.md](CHANGELOG.md) — version history
