# Rewrite CLAUDE.md — From Spec Document to Lean System Prompt

## Context

The current `CLAUDE.md` is ~450 lines and functions as a full project specification. Per CLAUDE.md best practices, it should be a concise system prompt (~100–150 instructions max). Content relevant to <80% of sessions should live in `docs/` or be discoverable from code. The current file also has outdated information (wrong model name, missing `jsonMode` pattern, unknown flow described as static menu).

## What Gets Removed (safe because it lives elsewhere)

| Removed Content | Already Lives In |
|---|---|
| Full DB schema (tables, columns, indexes) | `supabase/migrations/`, `src/lib/db/types.ts`, `docs/ARCHITECTURE.md` |
| Full Zod schema code examples | `src/lib/llm/schemas.ts` |
| Full LLM prompt templates + examples | `src/lib/llm/prompts.ts` |
| Key rotation code snippet | `src/lib/llm/client.ts` |
| Full project structure tree | Actual filesystem (matches spec) |
| Full env vars list | `.env.example`, `docs/ENVIRONMENT.md` |
| Message type handling table | `src/lib/webhook/normalize.ts` |
| Full error handling specs | Implemented across codebase |
| Rate limiting specs (not implemented) | Noted as "planned" in one line |
| Group message handling section | Guards in `normalize.ts` |
| Full session expiry details | 2-line summary sufficient |
| Full observability/monitoring specs | `src/lib/shared/logger.ts`, `docs/ARCHITECTURE.md` |
| Full step machine contract | 4-line "Step Handler" pattern |
| Acceptance tests list | `docs/FLOWS.md` |
| CI/CD pipeline details | `.github/workflows/` |

## What Gets Corrected

1. **Model:** `llama-3.3-70b-versatile` → `openai/gpt-oss-120b`
2. **Rule 4:** Updated to note `jsonMode: false` exception for conversational replies
3. **Unknown flow:** Described as conversational LLM + `_handoff_flow` handoff (not static menu)
4. **Topic shift:** Explicitly notes it's skipped in unknown flow
5. **Rate limiting:** Marked as "not yet implemented" instead of described as existing

## What Gets Added

1. **Rule 7:** No PII in logs (was buried in observability section, deserves rule status)
2. **Zod import:** `from "zod/v4"` (not `from "zod"`) — prevents a real bug
3. **"How to add a flow" checklist:** `registry.ts` + `FLOW_VALUES` in `schemas.ts`
4. **References section:** Pointers to `docs/` for deep dives

## New CLAUDE.md Structure (~96 lines)

```markdown
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

### Adding a Flow
Create definition in `src/lib/flows/<name>/`, register in `registry.ts`, add flow ID to `FLOW_VALUES` in `schemas.ts`.

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
```

## File Modified

- `CLAUDE.md` — full rewrite (451 lines → ~96 lines)

## Contrast with Masterclass Guidelines

| Guideline | How We Follow It |
|---|---|
| Max ~100–150 instructions | ~96 lines, well within budget |
| 80% relevance test | Every section is needed in most sessions |
| Don't duplicate linters | No style rules — rely on ESLint |
| Don't duplicate code | Schemas, prompts, guards all point to source files |
| Brief project overview | 2 lines |
| Commands section | 4 essential commands |
| Key directories | Pointers only, no tree |
| Move deep dives to `docs/` | References section links to 4 docs |
| Note what's NOT implemented | Rate limiting called out |
| Keep corrections accurate | Model, unknown flow, topic shift all updated |

## Verification

1. `npm run build` — no errors (`CLAUDE.md` is not compiled, but confirms nothing broke)
2. `npm run lint` — clean
3. Manual review: every fact in the new file matches the current codebase
