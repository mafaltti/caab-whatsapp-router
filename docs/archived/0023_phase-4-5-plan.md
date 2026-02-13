# Phase 4.5 — Groq LLM Integration (Subroute Router + Data Extractors)

## Context

Phase 4 implemented the Groq client, global flow router, and topic shift detector. Phase 4.5 completes the LLM layer by adding subroute classification (Layer B) and data extraction (Layer C) — the remaining building blocks needed before Phase 5/6 can implement flow step machines.

All new code is purely additive — no existing functions or signatures are modified.

---

## Pre-requisite: Commit existing uncommitted changes

Before starting Phase 4.5, commit the current uncommitted changes on `develop` (discriminated union refactor in `globalRouter.ts`, `after()` deferral in webhook route, empty-text guard, outbound persist logging, digits-only `userId` normalization). These are Phase 4 polish changes and should be committed separately.

---

## Design Decisions

1. **Subroute router:** Generic `classifySubroute()` function with a flow-specific configuration map (`SUBROUTE_CONFIG`). Prompts are generated dynamically from subroute definitions. This avoids per-flow function duplication.
2. **Extractors:** Both individual (one field per LLM call, for step machines) and combined (multi-field, for ambiguous messages). A generic `extractWithLlm<T>()` helper eliminates duplicated try/catch/parse/validate boilerplate across 5 extraction functions.
3. **Email validation:** `z.string().email().nullable()` — Zod v4 accepts `user+tag@domain.co` and rejects malformed strings. No custom regex needed.
4. **CPF/CNPJ and phone schemas:** Add `z.string().regex(/^\d+$/).nullable()` to reject formatted responses (e.g., `"123.456.789-00"`) at the schema level.

---

## Files to Modify/Create

| File | Action | Summary |
| --- | --- | --- |
| `src/lib/llm/schemas.ts` | MODIFY | Add 7 schemas, 6 types, `SUBROUTE_CONFIG` |
| `src/lib/llm/prompts.ts` | MODIFY | Add 12 prompt functions (subroute + extraction) |
| `src/lib/llm/subrouteRouter.ts` | CREATE | `classifySubroute()` with discriminated union |
| `src/lib/llm/extractors.ts` | CREATE | 5 extraction functions + `extractWithLlm` helper |
| `src/lib/llm/index.ts` | MODIFY | Export all new schemas, types, and functions |
| `docs/CHANGELOG.md` | MODIFY | Document Phase 4.5 changes |

---

## Step 1: `src/lib/llm/schemas.ts` — Add schemas and config

Append after the existing `CONFIDENCE_CLARIFY`:

### SubrouteRouterSchema

```typescript
export const SubrouteRouterSchema = z.object({
  subroute: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  reason: z.string().max(200),
});
export type SubrouteRouterResult = z.infer<typeof SubrouteRouterSchema>;
```

### DataExtractionSchema (combined)

```typescript
export const DataExtractionSchema = z.object({
  person_type: z.enum(["PF", "PJ"]).nullable(),
  cpf_cnpj: z.string().regex(/^\d+$/).nullable(),
  email: z.string().email().nullable(),
  phone: z.string().regex(/^\d+$/).nullable(),
  confidence: z.number().min(0).max(1),
  missing_fields: z.array(z.string()),
});
export type DataExtractionResult = z.infer<typeof DataExtractionSchema>;
```

### Individual extraction schemas (for step machine)

```typescript
export const PersonTypeExtractionSchema = z.object({
  person_type: z.enum(["PF", "PJ"]).nullable(),
  confidence: z.number().min(0).max(1),
});
export type PersonTypeExtractionResult = z.infer<typeof PersonTypeExtractionSchema>;

export const CpfCnpjExtractionSchema = z.object({
  cpf_cnpj: z.string().regex(/^\d+$/).nullable(),
  confidence: z.number().min(0).max(1),
});
export type CpfCnpjExtractionResult = z.infer<typeof CpfCnpjExtractionSchema>;

export const EmailExtractionSchema = z.object({
  email: z.string().email().nullable(),
  confidence: z.number().min(0).max(1),
});
export type EmailExtractionResult = z.infer<typeof EmailExtractionSchema>;

export const PhoneExtractionSchema = z.object({
  phone: z.string().regex(/^\d+$/).nullable(),
  confidence: z.number().min(0).max(1),
});
export type PhoneExtractionResult = z.infer<typeof PhoneExtractionSchema>;
```

### Subroute configuration map

```typescript
export interface SubrouteDefinition {
  id: string;
  description: string;
}

export const SUBROUTE_CONFIG: Record<string, SubrouteDefinition[]> = {
  digital_certificate: [
    { id: "purchase", description: "Comprar um novo certificado digital" },
    { id: "renewal", description: "Renovar certificado existente" },
    { id: "support", description: "Suporte tecnico, problemas ou duvidas tecnicas" },
    { id: "requirements", description: "Informacoes sobre documentos e requisitos necessarios" },
    { id: "status", description: "Verificar status de um pedido existente" },
  ],
  billing: [
    { id: "status", description: "Consultar status de fatura ou pagamento" },
  ],
};
```

---

## Step 2: `src/lib/llm/prompts.ts` — Add 12 prompt functions

### Subroute prompts

- **`subrouteRouterSystemPrompt(flow, subroutes[])`** — Dynamically builds prompt from flow name and subroute definitions, includes few-shot examples per flow (`digital_certificate`: 5 examples, `billing`: 1 example)
- **`subrouteRouterUserPrompt(text, chatHistory)`** — Same pattern as `globalRouterUserPrompt`

### Combined extraction prompts

- **`dataExtractionSystemPrompt()`** — Extract all fields (`person_type`, `cpf_cnpj`, `email`, `phone`) from one message
- **`dataExtractionUserPrompt(text)`** — `"Mensagem do usuario: {text}"`

### Individual extraction prompts (each with few-shot examples in Portuguese)

- **`personTypeExtractionSystemPrompt()`** / **`personTypeExtractionUserPrompt(text)`**
- **`cpfCnpjExtractionSystemPrompt(expectedType: "PF" | "PJ" | null)`** / **`cpfCnpjExtractionUserPrompt(text)`** — Dynamic: if PF look for 11 digits, if PJ look for 14
- **`emailExtractionSystemPrompt()`** / **`emailExtractionUserPrompt(text)`**
- **`phoneExtractionSystemPrompt()`** / **`phoneExtractionUserPrompt(text)`**

**Reuse:** Import `ChatMessage` from `@/lib/db` (already imported), `SubrouteDefinition` from `./schemas` (new import).

---

## Step 3: `src/lib/llm/subrouteRouter.ts` — NEW file

Follows the exact `classifyFlow()` pattern from `globalRouter.ts`:

```typescript
export type ClassifySubrouteResult =
  | { ok: true; data: SubrouteRouterResult }
  | { ok: false; errorType: "llm_error" | "invalid_json" | "schema_validation" | "invalid_subroute" | "no_subroutes" };
```

**5-stage validation pipeline:**

1. Check if flow has subroutes in `SUBROUTE_CONFIG` — if not, return `no_subroutes`
2. `callLlm()` — on error, return `llm_error`
3. `JSON.parse()` — on error, return `invalid_json`
4. `SubrouteRouterSchema.safeParse()` — on error, return `schema_validation`
5. Check returned subroute is in flow's valid IDs — if not, return `invalid_subroute`

**Imports:** `logger` from shared, `ChatMessage` from db, schemas/prompts from local, `callLlm` from client.

---

## Step 4: `src/lib/llm/extractors.ts` — NEW file

### Generic helper (DRY)

```typescript
async function extractWithLlm<T>(options: {
  systemPrompt: string;
  userPrompt: string;
  schema: ZodSchema;
  eventPrefix: string;
  correlationId?: string;
}): Promise<{ ok: true; data: T } | { ok: false; errorType: ExtractionErrorType }>
```

Uses `maxTokens: 200` (extraction responses are short).

### Individual extractors (each delegates to `extractWithLlm`)

- **`extractPersonType({ text, correlationId })`** → `ExtractPersonTypeResult`
- **`extractCpfCnpj({ text, expectedType?, correlationId })`** → `ExtractCpfCnpjResult`
- **`extractEmail({ text, correlationId })`** → `ExtractEmailResult`
- **`extractPhone({ text, correlationId })`** → `ExtractPhoneResult`

### Combined extractor

- **`extractData({ text, correlationId })`** → `ExtractDataResult`

### Error type (shared)

```typescript
type ExtractionErrorType = "llm_error" | "invalid_json" | "schema_validation";
```

---

## Step 5: `src/lib/llm/index.ts` — Update barrel exports

Add exports for:

- **Schemas:** `SubrouteRouterSchema`, `DataExtractionSchema`, individual extraction schemas, `SUBROUTE_CONFIG`, `SubrouteDefinition`
- **Types:** All `*Result` types
- **Functions:** `classifySubroute`, `extractPersonType`, `extractCpfCnpj`, `extractEmail`, `extractPhone`, `extractData`

---

## Step 6: `docs/CHANGELOG.md` — Document changes

Add Phase 4.5 section under **Unreleased**.

---

## Verification

1. **TypeScript compilation:** `npm run build` — all types must compile with no errors
2. **Schema validation check:** Manually verify each schema accepts valid data and rejects invalid:
   - `SubrouteRouterSchema.safeParse({ subroute: "purchase", confidence: 0.9, reason: "test" })` → success
   - `CpfCnpjExtractionSchema.safeParse({ cpf_cnpj: "123.456.789-00", confidence: 0.9 })` → failure (regex rejects dots/dashes)
   - `EmailExtractionSchema.safeParse({ email: "user@example.com", confidence: 0.9 })` → success
3. **Import/export check:** All new exports are accessible from `@/lib/llm`
4. **No regressions:** Existing `classifyFlow()` and `detectTopicShift()` remain unchanged
