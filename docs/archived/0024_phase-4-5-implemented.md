## Phase 4.5 — Implemented

### Files modified

- **src/lib/llm/schemas.ts** — Added 7 Zod schemas (`SubrouteRouterSchema`, `DataExtractionSchema`, `PersonTypeExtractionSchema`, `CpfCnpjExtractionSchema`, `EmailExtractionSchema`, `PhoneExtractionSchema`), 6 types, `SubrouteDefinition` interface, and `SUBROUTE_CONFIG` map (`digital_certificate`: 5 subroutes, `billing`: 1 subroute)
- **src/lib/llm/prompts.ts** — Added 12 prompt functions: subroute router system/user, combined data extraction system/user, and individual extraction prompts for person type, CPF/CNPJ (with dynamic PF/PJ hints), email, and phone — all in Portuguese with few-shot examples
- **src/lib/llm/index.ts** — Updated barrel exports for all new schemas, types, and functions

### Files created

- **src/lib/llm/subrouteRouter.ts** — `classifySubroute()` with 5-stage validation: config check → LLM call → JSON parse → Zod schema → valid subroute ID. Returns discriminated union `ClassifySubrouteResult`
- **src/lib/llm/extractors.ts** — Generic `extractWithLlm<T>()` helper + 5 extractors: `extractPersonType`, `extractCpfCnpj`, `extractEmail`, `extractPhone`, `extractData`

### Files updated

- **docs/CHANGELOG.md** — Documented Phase 4.5 changes

### Verification

- `tsc --noEmit` — clean
- `npm run build` — compiled successfully, all routes intact