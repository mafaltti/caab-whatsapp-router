# Update `docs/FLOWS.md` to Match Current Implementation

## Context

Flow versioning just landed — all flow files moved into `v1/` subdirectories. But `FLOWS.md` has broader drift: it was written as an MVP planning spec and several sections no longer match what the code actually does. This update syncs the doc with reality.

## File

`docs/FLOWS.md` (single file, ~1200 lines)

## Changes

### 1. Add versioning note after the Overview section (~line 11)

Add a short paragraph explaining:

- Flow files live in `src/lib/flows/<name>/v1/`
- `FlowDefinition` has `version` and `active` fields
- `FLOW_VERSION_OVERRIDES` env var for runtime pinning
- Reference `CLAUDE.md` "Flow Versioning" pattern for details

### 2. Fix Digital Certificate Status subroute (lines 536–594)

- **Spec says:** 3 steps (`ask_order_id_status` → `lookup_status` → `done_status`)
- **Code does:** 1 step (`ask_order_id`) that asks, looks up, and returns result with `done: true`

Consolidate to a single-step description matching the actual implementation.

### 3. Fix Billing Status subroute (lines 611–681)

- **Spec says:** 3 steps (`ask_invoice_id` → `lookup_invoice` → `done_billing`)
- **Code does:** 1 step (`ask_invoice_id`) that collects ID, looks up mock status, returns result with `done: true`

Same pattern — consolidate to single-step description.

### 4. Rewrite Unknown flow section (lines 760–809)

- **Spec says:** Single `clarify_intent` step with static menu
- **Code does:** Conversational LLM flow with 2 steps (`start`, `awaiting_reply`), 5-turn limit, internal flow classification, `_handoff_flow` handoff mechanism, static menu only as LLM fallback

Rewrite to describe the actual conversational behavior.

### 5. Update General Support flow section (lines 684–757)

- **Spec says:** Steps named `ask_details` → `provide_answer` → `done_support`
- **Code does:** Steps named `start` → `awaiting_problem` → `awaiting_handoff`

Changes:

- Fix step names
- Remove "knowledge base search" reference (not implemented)
- Describe the actual behavior: LLM summary + human handoff offer

### 6. Update Implementation Checklist (lines 1065–1098)

Most items are done. Update checkboxes to reflect current status:

- Phases 1–4: all checked (done)
- Phase 5: topic shift ✅, session expiry ✅, command detection and rate limiting still unchecked

### 7. Update "Future Enhancements" section (lines 1100–1123)

Remove items that are already implemented (conversational unknown flow, LLM-based intent detection). Keep genuinely future items (rich media, multi-language, sentiment analysis, A/B testing).

## Changes NOT Made

- **LLM prompt templates in the appendix (lines 1126–1189)** — these are illustrative, not exact copies of code; keeping them as reference is fine
- **Testing scenarios section** — still useful as manual test scripts
- **Data collection summary tables** — still accurate

## Verification

1. Read through the updated doc to confirm no stale references remain
2. `npm run build` — confirm no accidental code changes
