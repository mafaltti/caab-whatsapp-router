# Unknown Flow — LLM Context Q&A

## Is the menu message hardcoded or constructed dynamically from existing flows?

```
"Como posso te ajudar?
1️⃣ Certificado Digital
2️⃣ Faturamento
3️⃣ Suporte Geral"
```

It's **hardcoded**. The static menu in `src/lib/flows/unknown/steps.ts:10-14`:

```typescript
const STATIC_MENU =
  "Como posso te ajudar?\n\n" +
  "1️⃣ Certificado Digital\n" +
  "2️⃣ Faturamento\n" +
  "3️⃣ Suporte Geral";
```

If you add or rename a flow, this string won't update automatically. Same for the LLM system prompt in `prompts.ts` — the available services are also hardcoded there.

---

## But you use this `STATIC_MENU` const in the prompt to the LLM, right?

**No.** They're separate. The `STATIC_MENU` is only used as a **fallback reply** — sent directly to the user when the LLM fails or after 5 turns. It's never passed to the LLM.

The LLM gets its own hardcoded list in `unknownConversationSystemPrompt()` (`prompts.ts:310-313`):

```
Serviços disponíveis:
- Certificado digital (e-CPF, e-CNPJ, A1, A3 — compra, renovação, suporte técnico)
- Faturamento (boleto, fatura, pagamento)
- Suporte geral (atendimento humano, dúvidas)
```

So there are **two separate hardcoded lists** saying essentially the same thing. If a flow changes, you'd need to update both.
