# Flow Versioning Implementation Plan

## Context

The `digital_certificate` flow has 16 step handlers and 5 subroutes — any rewrite carries real risk. Flow versioning adds a safety net: keep v1 intact while working on v2, with instant env-var rollback if v2 breaks in production. The team reviewed 4 approaches and chose Registry Metadata + Env-Driven Rollback (see `docs/archived/0044-team-review-flow-versioning.md`).

Zero changes to DB, LLM, routing, session state, or `FLOW_VALUES`.

## Design Decisions

1. **Registry validation at module load** — fail fast on misconfigured registry (matches `getApiKeys()` pattern in `client.ts`)
2. **`FLOW_VERSION_OVERRIDES` format** — comma-separated key=value pairs: `digital_certificate=v1,billing=v1`
3. **Export names get version suffix** — `digitalCertificateFlow` → `digitalCertificateFlowV1` (ready for v2 coexistence)
4. **`getFlowDefinition` signature unchanged** — `(flowId: string): FlowDefinition | null` (no optional version param — YAGNI)

## Pre-work

- Ensure develop is up to date: `git pull origin develop`
- Create feature branch: `git checkout -b feature/flow-versioning`

## Implementation Steps

### Step 1: Extend `FlowDefinition` type

**File:** `src/lib/flows/types.ts`

Add `version: string` and `active: boolean` to the `FlowDefinition` interface.

### Step 2: Move flow files into `v1/` subdirectories

Use `git mv` to preserve blame history. All files in each flow directory move into a `v1/` subdirectory:

| Flow | Files to move |
|---|---|
| `digitalCertificate/` → `digitalCertificate/v1/` | `flow.ts`, `steps.ts`, `helpers.ts`, `validation.ts`, `subroutes/*` (9 files) |
| `billing/` → `billing/v1/` | `flow.ts`, `steps.ts`, `helpers.ts`, `subroutes/status.ts` (4 files) |
| `generalSupport/` → `generalSupport/v1/` | `flow.ts`, `steps.ts`, `helpers.ts` (3 files) |
| `unknown/` → `unknown/v1/` | `flow.ts`, `steps.ts` (2 files) |

**Import fix:** Files that import from `"../types"` need `"../../types"` (one extra `../`). Subroute files that import from `"../../types"` need `"../../../types"`. Intra-flow relative imports (`./steps`, `../helpers`) stay the same since the entire tree moves together. Absolute imports (`@/lib/...`) are unaffected.

### Step 3: Add version metadata to flow definitions

In each `v1/flow.ts`, add `version: "v1"`, `active: true` and rename the export:

- `unknownFlow` → `unknownFlowV1`
- `generalSupportFlow` → `generalSupportFlowV1`
- `digitalCertificateFlow` → `digitalCertificateFlowV1`
- `billingFlow` → `billingFlowV1`

### Step 4: Rewrite `registry.ts`

**File:** `src/lib/flows/registry.ts`

- Change `FLOW_REGISTRY` from `Record<string, FlowDefinition>` to `FlowDefinition[]`
- Update imports to point to `./*/v1/flow` with new export names
- Add `parseVersionOverrides()` — reads `FLOW_VERSION_OVERRIDES` env var
- Add `validateRegistry()` — runs at module load, checks:
  - No two versions of same flow both active
  - Every `FLOW_VALUES` entry has at least one registered version
  - Every flow has an active version (or env override)
  - Logs registry summary on success
- Update `getFlowDefinition()` — check env override first, then return active version

### Step 5: Update `.env.example`

Add commented-out `FLOW_VERSION_OVERRIDES` line.

### Step 6: Update docs

- `docs/ENVIRONMENT.md` — add `FLOW_VERSION_OVERRIDES` description
- `CLAUDE.md` — add versioning note under "Key Patterns"

## Files Changed

| File | Change |
|---|---|
| `src/lib/flows/types.ts` | Add `version` + `active` fields |
| `src/lib/flows/registry.ts` | Full rewrite: array registry, validation, env override |
| `src/lib/flows/*/v1/flow.ts` (×4) | Add version metadata, rename exports |
| `src/lib/flows/*/v1/steps.ts` (×4) | Fix `../types` → `../../types` import |
| `src/lib/flows/*/v1/helpers.ts` (×3) | Fix `../types` → `../../types` import (if applicable) |
| `src/lib/flows/digitalCertificate/v1/subroutes/*` (×5) | Fix `../../types` → `../../../types` import |
| `src/lib/flows/billing/v1/subroutes/status.ts` | Fix `../../types` → `../../../types` import |
| `.env.example` | Add `FLOW_VERSION_OVERRIDES` |
| `docs/ENVIRONMENT.md` | Document new env var |
| `CLAUDE.md` | Add versioning pattern |

## Files NOT Changed (confirmed)

- `src/lib/flows/engine.ts` — `getFlowDefinition(flowId)` signature unchanged
- `src/lib/flows/index.ts` — re-exports still valid
- `src/lib/routing/routeMessage.ts` — unchanged
- `src/lib/llm/schemas.ts` — `FLOW_VALUES` unchanged
- `src/lib/db/*` — no DB changes
- `supabase/migrations/*` — no migrations

## Verification

1. `npm run build` — TypeScript compilation succeeds
2. `npm run lint` — no lint errors
3. Manually verify `getFlowDefinition("digital_certificate")` returns the v1 flow definition
4. Verify registry validation catches: duplicate active versions, missing flows
