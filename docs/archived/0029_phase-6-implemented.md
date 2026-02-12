## Phase 6 — Digital Certificate Flow

### New Files Created (7)

| File | Purpose |
|------|---------|
| `validation.ts` | CPF (11 digits), CNPJ (14 digits), email, phone validators |
| `helpers.ts` | Protocol ID generation, retry tracking (max 3), confirmation/field detection, summary formatting |
| `subroutes/purchase.ts` | 6 steps: person type → CPF/CNPJ → email → phone → confirm → correction |
| `subroutes/renewal.ts` | 3 steps: order ID → email → confirm |
| `subroutes/support.ts` | 3 steps: problem description → order ID (optional) → confirm |
| `subroutes/requirements.ts` | 2 steps: show PF/PJ requirements → offer purchase |
| `subroutes/status.ts` | 1 step: collect order ID → mock status lookup |

### Modified Files (2)

- **steps.ts** — `handleStart` now lists the 5 options instead of "coming soon"
- **flow.ts** — Wires all 5 subroutes into the `FlowDefinition`

### Key Patterns Used

- **`_asked_X` sentinel flags** — distinguish "asking the question" vs "processing the answer" on first entry
- **`_correcting` flag** — routes back to `confirm` after a field correction instead of continuing forward
- **Retry tracking** — with human handoff after 3 failed attempts
- **Protocol IDs** — in format `CD-YYYYMMDD-XXXX`
