# Team Review Summary — Issue #2: Flow Versioning

## Recommendation: Registry Metadata + Env-Driven Rollback (Hybrid)

The team evaluated all 4 approaches from the issue:

| Approach | Complexity | Rollback | A/B Testing | Session Risk | Codebase Fit |
|---|---|---|---|---|---|
| 1. Registry Metadata | Medium | Deploy | Good | Low | High |
| 2. Alias Pointer | Medium-High | Deploy | Good | High | Low |
| 3. Env-Driven | Low-Medium | Instant | Limited | Low | Medium |
| 4. Git-Only | Minimal | Deploy | None | None | N/A |

**Winner: Approach 1 (Registry Metadata)** enhanced with an optional `FLOW_VERSION_OVERRIDES` env var for emergency rollback. Key reasons:

1. **Session stability** — `active_flow` stays as a plain string (`"digital_certificate"`). No migration, no breakage.
2. **Zero LLM changes** — `FLOW_VALUES`, prompts, classification, topic shift — all untouched because flow IDs don't change.
3. **Zero routing changes** — `routeMessage.ts`, `engine.ts`, classifiers all work as-is.
4. **Zero DB changes** — no new tables, no migrations, no type regeneration.
5. **Natural extension** — adds `version` and `active` to `FlowDefinition`, changes registry from `Record` to array with version-aware lookup. Minimal surface area.

## Implementation Plan (8 Steps)

1. **Extend `FlowDefinition`** — add `version: string` and `active: boolean` to `types.ts`
2. **Update `registry.ts`** — change from `Record<string, FlowDefinition>` to `FlowDefinition[]` with version-aware `getFlowDefinition()` that returns the active version
3. **Restructure flow dirs** — `flows/digitalCertificate/v1/flow.ts`, etc. (current code becomes v1)
4. **Add version fields** — update all 4 `flow.ts` files with `version: "v1"`, `active: true`
5. **Add `FLOW_VERSION_OVERRIDES` env var** — registry checks overrides first for instant rollback
6. **Add registry validation** — no two versions of same flow both `active`, every `FLOW_VALUES` entry has at least one version
7. No DB changes needed
8. No LLM changes needed

## Files Changed (Only 6)

| File | Change |
|---|---|
| `src/lib/flows/types.ts` | Add `version` + `active` fields |
| `src/lib/flows/registry.ts` | Version-aware lookup + env override |
| `src/lib/flows/digitalCertificate/flow.ts` | Add version metadata |
| `src/lib/flows/billing/flow.ts` | Add version metadata |
| `src/lib/flows/generalSupport/flow.ts` | Add version metadata |
| `src/lib/flows/unknown/flow.ts` | Add version metadata |

**Total risk: LOW.** The change is additive and backwards-compatible.
