## Phase 5 — Flow Framework + Deterministic Step Machine

### Files Created (10)

| File | Purpose |
|------|---------|
| `src/lib/flows/types.ts` | Core interfaces: `FlowContext`, `StepResult`, `StepHandler`, `FlowSubrouteDefinition`, `FlowDefinition`, `FlowExecutionResult` |
| `src/lib/flows/unknown/steps.ts` | Menu step — shows options, `done: true` |
| `src/lib/flows/unknown/flow.ts` | Flow definition (1 step) |
| `src/lib/flows/generalSupport/steps.ts` | Multi-turn proof: `start` → `awaiting_problem` → handoff with `done: true` |
| `src/lib/flows/generalSupport/flow.ts` | Flow definition (2 steps) |
| `src/lib/flows/digitalCertificate/steps.ts` | Stub — placeholder message, `done: true` |
| `src/lib/flows/digitalCertificate/flow.ts` | Stub flow definition |
| `src/lib/flows/billing/steps.ts` | Stub — placeholder message, `done: true` |
| `src/lib/flows/billing/flow.ts` | Stub flow definition |
| `src/lib/flows/registry.ts` | Maps flow IDs → definitions, exports `getFlowDefinition()` |
| `src/lib/flows/engine.ts` | Core engine: flow lookup → subroute classification → step resolution → execution |
| `src/lib/flows/index.ts` | Barrel export |

### File Modified (1)

- **src/lib/routing/routeMessage.ts** — Replaced `FLOW_REPLIES`, `TOPIC_SWITCH_PREFIX`, and `CLARIFY_REPLY` constants with `executeFlow()` calls across all 3 scenarios (continue flow, topic shift, new session). Session persistence now uses `clearSession()` when `done: true`, else `upsertSession()` with `nextState`.

### File Deleted (1)

- **src/lib/flows/.gitkeep**

### Verification

- `npx tsc --noEmit` — passes
- `npm run build` — compiles and builds successfully
