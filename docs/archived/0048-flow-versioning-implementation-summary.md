# Flow Versioning — Implementation Summary

## Implementation Complete

### Step 1 — Extended `FlowDefinition` type (`src/lib/flows/types.ts`)

- Added `version: string` and `active: boolean` fields

### Step 2 — Moved all flow files into `v1/` subdirectories (18 files via `git mv`)

- `unknown/` → `unknown/v1/` (2 files)
- `generalSupport/` → `generalSupport/v1/` (3 files)
- `billing/` → `billing/v1/` (4 files)
- `digitalCertificate/` → `digitalCertificate/v1/` (9 files)

### Step 3 — Fixed imports + added version metadata

- All `../types` → `../../types` (flow-level files)
- All `../../types` → `../../../types` (subroute files)
- Renamed exports: `unknownFlowV1`, `generalSupportFlowV1`, `digitalCertificateFlowV1`, `billingFlowV1`
- Added `version: "v1"`, `active: true` to each

### Step 4 — Rewrote `registry.ts`

- `FLOW_REGISTRY` is now a `FlowDefinition[]` array
- `parseVersionOverrides()` reads `FLOW_VERSION_OVERRIDES` env var
- `validateRegistry()` runs at module load — checks duplicate active versions, missing flows, missing active version
- `getFlowDefinition()` signature unchanged — checks env override first, then returns active version

### Step 5 — Updated `.env.example`

Added commented-out `FLOW_VERSION_OVERRIDES`.

### Step 6 — Updated docs

- `CLAUDE.md` — added "Flow Versioning" pattern under Key Patterns
- `docs/ENVIRONMENT.md` — documented `FLOW_VERSION_OVERRIDES` env var

## Verification

- `npm run build` — compiles successfully, registry validation logs `unknown=v1`, `general_support=v1`, `digital_certificate=v1`, `billing=v1`
- `npm run lint` — no errors
- `getFlowDefinition` signature unchanged — `engine.ts`, `index.ts`, `routeMessage.ts` all untouched
