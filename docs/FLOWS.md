# Flow Specifications

## Overview
This document specifies the exact behavior of each conversation flow, including subroutes, steps, data collection, validation rules, and response templates.

**Flows Implemented**:
1. **Digital Certificate** (`digital_certificate`) - MVP Priority 1
2. **Billing/Payment** (`billing`) - Priority 2
3. **General Support** (`general_support`) - Catch-all
4. **Unknown** (`unknown`) - Clarification

### Flow Versioning

Flow source files live in `src/lib/flows/<name>/v1/`. Each `FlowDefinition` carries `version` (e.g. `"v1"`) and `active: boolean` fields. The registry is a flat array and `getFlowDefinition(flowId)` returns the active version. To pin a flow to a specific version at runtime, set the `FLOW_VERSION_OVERRIDES` env var (e.g. `FLOW_VERSION_OVERRIDES=digital_certificate=v1`). To add v2: create `v2/` alongside `v1/`, set `active: true` on v2 and `active: false` on v1, register both in `registry.ts`.

### Adding a Flow

Create definition in `src/lib/flows/<name>/v1/`, register in `registry.ts`, add flow ID to `FLOW_VALUES` in `schemas.ts`.

---

## Flow 1: Digital Certificate

**Flow ID**: `digital_certificate`

**Description**: Handles all digital certificate requests including purchase, renewal, technical support, requirements information, and status checks.

**Entry Triggers**:
- **Keywords**: "certificado", "certificado digital", "e-CPF", "e-CNPJ", "assinatura digital"
- **LLM Classification**: Confidence >= 0.80

**Subroutes**: 5 total
1. `purchase` - Buy new certificate (most complex)
2. `renewal` - Renew existing certificate
3. `support` - Technical issues/problems
4. `requirements` - Information about what's needed
5. `status` - Check order status

---

### 1.1 Purchase Subroute

**Subroute ID**: `purchase`
**Goal**: Collect all necessary information to process a new digital certificate order.

#### Steps (in sequence)

##### Step 1: `ask_person_type`

**Bot Question**:
```
Você é pessoa física (PF) ou pessoa jurídica (PJ)?
```

**Expected User Input**:
- "PF", "física", "pessoa física", "sou PF"
- "PJ", "jurídica", "pessoa jurídica", "empresa", "CNPJ"
- Or free-form text mentioning one of these

**Validation**:
- Use LLM extraction to normalize input to "PF" or "PJ"
- If unclear after extraction (confidence < 0.80):
  ```
  Não entendi. Por favor, responda:
  1 - Pessoa Física (PF)
  2 - Pessoa Jurídica (PJ)
  ```
- Max retries: 2
- After 2 retries: Offer human handoff

**State Update**:
```json
{
  "data": {
    "person_type": "PF"  // or "PJ"
  }
}
```

**Next Step**: `ask_cpf_cnpj`

---

##### Step 2: `ask_cpf_cnpj`

**Bot Question** (dynamic based on person_type):
- If PF:
  ```
  Por favor, envie seu CPF (somente números).
  Exemplo: 12345678900
  ```
- If PJ:
  ```
  Por favor, envie seu CNPJ (somente números).
  Exemplo: 12345678000199
  ```

**Expected User Input**:
- Numbers with or without formatting
- Examples: "123.456.789-00", "12345678900", "meu CPF é 123.456.789-00"

**Validation**:
1. **LLM Extraction**: Extract digits from free-form text
2. **Format Validation**:
   - CPF: Exactly 11 digits
   - CNPJ: Exactly 14 digits
3. **Basic Validation**:
   - Not all same digit (e.g., "11111111111")
   - Not sequential (e.g., "12345678901")
   - (Optional: Calculate check digits - implement if needed)

**Error Messages**:
- Invalid length:
  ```
  O [CPF/CNPJ] deve ter [11/14] dígitos. Por favor, envie novamente.
  ```
- All same digits:
  ```
  Este [CPF/CNPJ] não parece válido. Por favor, verifique e envie novamente.
  ```

**Retry Logic**:
- Max retries: 3
- After 3rd retry:
  ```
  Estou tendo dificuldade em validar seu [CPF/CNPJ].
  Gostaria de falar com um atendente humano?
  ```

**State Update**:
```json
{
  "data": {
    "person_type": "PF",
    "cpf_cnpj": "12345678900"  // digits only, no formatting
  }
}
```

**Next Step**: `ask_email`

---

##### Step 3: `ask_email`

**Bot Question**:
```
Qual é seu melhor email para contato?
```

**Expected User Input**:
- "user@example.com"
- "meu email é user@example.com"
- "pode mandar pra user@example.com"

**Validation**:
1. **LLM Extraction**: Extract email from free-form text
2. **Format Validation**:
   - Contains "@"
   - Has domain part after "@"
   - No spaces
3. **No strict regex** (accept varied formats like "user+tag@example.com")

**Error Messages**:
- Missing "@":
  ```
  Por favor, envie um email válido. Exemplo: seuemail@exemplo.com
  ```
- Malformed:
  ```
  Este email não parece válido. Por favor, verifique e envie novamente.
  ```

**Retry Logic**:
- Max retries: 3
- After 3rd retry: Offer human handoff

**State Update**:
```json
{
  "data": {
    "person_type": "PF",
    "cpf_cnpj": "12345678900",
    "email": "user@example.com"
  }
}
```

**Next Step**: `ask_phone`

---

##### Step 4: `ask_phone`

**Bot Question**:
```
Qual é seu telefone com DDD?
Exemplo: 11999999999
```

**Expected User Input**:
- "11999999999"
- "(11) 99999-9999"
- "11 9 9999-9999"
- "meu telefone é (11) 99999-9999"

**Validation**:
1. **LLM Extraction**: Extract digits from text
2. **Format Validation**:
   - 10 digits (landline with DDD) OR 11 digits (mobile with DDD)
   - First 2 digits = DDD (valid range: 11-99)
3. **Normalize**: Store digits only

**Error Messages**:
- Wrong length:
  ```
  Por favor, envie o telefone com DDD (10 ou 11 dígitos).
  Exemplo: 11999999999
  ```

**Retry Logic**:
- Max retries: 3
- After 3rd retry: Offer human handoff

**State Update**:
```json
{
  "data": {
    "person_type": "PF",
    "cpf_cnpj": "12345678900",
    "email": "user@example.com",
    "phone": "11999999999"
  }
}
```

**Next Step**: `confirm`

---

##### Step 5: `confirm`

**Bot Message** (show summary):
```
Por favor, confirme seus dados:

📋 Tipo: [Pessoa Física/Pessoa Jurídica]
📝 [CPF/CNPJ]: [***.***.***-**] (masked for privacy)
📧 Email: [user@example.com]
📱 Telefone: [(11) 9****-9999] (partially masked)

Está tudo correto?
Digite SIM para confirmar ou NÃO para corrigir.
```

**Expected User Input**:
- "sim", "yes", "está correto", "confirmar", "ok"
- "não", "no", "errado", "corrigir"

**Validation**: Simple yes/no detection (can use keywords or LLM)

**If YES**:
- **Next Step**: `done`

**If NO**:
- **Bot Message**:
  ```
  Qual dado está incorreto?
  1 - CPF/CNPJ
  2 - Email
  3 - Telefone
  ```
- **Expected**: "1", "2", "3", or "CPF", "email", "telefone"
- **Action**: Route back to corresponding step:
  - "1" or "cpf" → `ask_cpf_cnpj`
  - "2" or "email" → `ask_email`
  - "3" or "telefone" → `ask_phone`

**Next Step**: `done` (if confirmed) or back to specific field (if correcting)

---

##### Step 6: `done`

**Bot Message**:
```
✅ Perfeito! Recebemos sua solicitação de certificado digital.

Nosso time entrará em contato no email [user@example.com] ou telefone [(11) 9****-9999] em até 24 horas úteis.

📌 Número do protocolo: [CERT-2026-XXXXX]

Posso ajudar com mais alguma coisa?
```

**Protocol Number Generation**:
- Format: `CERT-{YEAR}-{RANDOM_5_DIGITS}`
- Example: `CERT-2026-47382`
- Store in session data for reference

**State Update**:
```json
{
  "data": {
    "person_type": "PF",
    "cpf_cnpj": "12345678900",
    "email": "user@example.com",
    "phone": "11999999999",
    "protocol": "CERT-2026-47382",
    "completed_at": "2026-02-11T14:30:00Z"
  },
  "done": true
}
```

**Session Cleanup**:
- Option A: Delete conversation_state (session ends)
- Option B: Mark as complete, keep for 24h (allow user to ask "what was my protocol number?")

**Next Interaction**:
- If user sends new message, treat as new conversation

---

### 1.2 Renewal Subroute

**Subroute ID**: `renewal`
**Goal**: Collect information to renew an existing digital certificate.

#### Steps (simplified)

##### Step 1: `ask_order_id`

**Bot Question**:
```
Para renovar seu certificado, preciso do número do pedido anterior.
Você tem o número?
```

**Expected**:
- Order ID (e.g., "CERT-2025-12345")
- "Não sei", "não tenho", "não lembro"

**Validation**:
- If has order ID: Extract and validate format (alphanumeric)
- If "não sei": Go to `ask_cpf_cnpj_renewal`

**Next Step**: `ask_cpf_cnpj_renewal` OR `ask_email_renewal` (if order ID provided)

---

##### Step 2: `ask_cpf_cnpj_renewal` (conditional)

Same as purchase `ask_cpf_cnpj`.

**Next Step**: `ask_email_renewal`

---

##### Step 3: `ask_email_renewal`

Same as purchase `ask_email`.

**Next Step**: `confirm_renewal`

---

##### Step 4: `confirm_renewal`

**Bot Message**:
```
Renovação solicitada!

📌 Pedido anterior: [CERT-2025-12345 or CPF ***.***.***-**]
📧 Email: [user@example.com]

Está correto? (sim/não)
```

**Next Step**: `done_renewal` (if yes) or back to field (if no)

---

##### Step 5: `done_renewal`

**Bot Message**:
```
✅ Renovação registrada com sucesso!

Você receberá instruções no email [user@example.com] em até 24 horas.

📌 Protocolo de renovação: [RENEW-2026-XXXXX]

Mais alguma dúvida?
```

**Session Cleanup**: Same as purchase flow

---

### 1.3 Support Subroute

**Subroute ID**: `support`
**Goal**: Register a technical support request.

#### Steps

##### Step 1: `ask_problem`

**Bot Question**:
```
Qual problema você está enfrentando com seu certificado digital?

Por favor, descreva o problema.
```

**Expected**: Free-form text description

**Validation**: None (accept any text, store as-is)

**State Update**:
```json
{
  "data": {
    "problem_description": "Certificado não está instalando no navegador"
  }
}
```

**Next Step**: `ask_order_id_support`

---

##### Step 2: `ask_order_id_support`

**Bot Question**:
```
Você tem o número do pedido ou protocolo do certificado?

Se não tiver, pode pular digitando "não sei".
```

**Expected**:
- Order ID
- "Não sei", "não tenho"

**Validation**: Optional field (not required)

**Next Step**: `confirm_support`

---

##### Step 3: `confirm_support`

**Bot Message** (with LLM summary of problem):
```
Registramos seu chamado de suporte:

🔧 Problema: [Brief LLM-generated summary, max 100 chars]
📌 Pedido: [CERT-2025-12345 or "não informado"]

Está correto? (sim/não)
```

**LLM Summary**:
- Use LLM to generate brief summary from `problem_description`
- Max 100 characters
- Example: "Dificuldade ao instalar certificado no navegador"

**Next Step**: `done_support` (if yes) or back to ask_problem (if no)

---

##### Step 4: `done_support`

**Bot Message**:
```
✅ Chamado aberto com sucesso!

📌 Protocolo: [SUP-2026-XXXXX]

Nosso suporte técnico entrará em contato em até 12 horas úteis.

Posso ajudar com mais alguma coisa?
```

**Session Cleanup**: Same as other flows

---

### 1.4 Requirements Subroute

**Subroute ID**: `requirements`
**Goal**: Provide information about what's needed for a digital certificate.

#### Steps

##### Step 1: `show_requirements`

**Bot Message**:
```
Para emitir um certificado digital, você precisará de:

📋 **Pessoa Física (e-CPF):**
✅ CPF
✅ RG (frente e verso)
✅ Comprovante de residência (últimos 3 meses)
✅ Selfie segurando o documento

🏢 **Pessoa Jurídica (e-CNPJ):**
✅ CNPJ
✅ Contrato social ou requerimento de empresário
✅ RG e CPF do responsável legal
✅ Comprovante de endereço da empresa
✅ Selfie do responsável com documento

Quer iniciar o processo de compra? (sim/não)
```

**Expected**: "sim" or "não"

**If SIM**:
- **Action**: Redirect to `purchase` subroute
- **State Update**: Switch subroute to "purchase", reset step to "ask_person_type"

**If NÃO**:
- **Next Step**: `done_requirements`

---

##### Step 2: `done_requirements`

**Bot Message**:
```
Ok! Se precisar de ajuda, é só me chamar.

Posso ajudar com mais alguma coisa?
```

**Session Cleanup**: Clear session or mark as complete

---

### 1.5 Status Subroute

**Subroute ID**: `status`
**Goal**: Check the status of an existing certificate order.

#### Steps

##### Single step: `ask_order_id`

**First turn** — asks for the order/protocol number:
```
Para consultar o status, preciso do número do seu pedido ou protocolo.
```

**Second turn** — validates length (>= 3 chars), performs mock lookup, and returns a response with `done: true`:
```
Encontrei seu pedido *CERT-2026-12345*:

*Status:* Em processamento
Seu pedido está sendo analisado pela equipe. Previsão: 2 dias úteis.

Se precisar de mais alguma coisa, é só enviar uma mensagem!
```

**Mock status logic**: based on last digit of order ID:
- 0–3 → "Em processamento"
- 4–6 → "Aguardando validação"
- 7–9 → "Concluído"

**Validation**: If input < 3 characters, asks again (with retry counter). After max retries, offers human handoff.

**For Production**: Replace mock with actual API call to order system.

---

## Flow 2: Billing/Payment

**Flow ID**: `billing`

**Description**: Handle invoice and payment status inquiries.

**Entry Triggers**:
- **Keywords**: "boleto", "pagamento", "fatura", "cobrança", "pagar", "quanto custa"
- **LLM Classification**: Confidence >= 0.80

**Subroutes**: 1 (MVP)
- `status` - Check invoice status

---

### 2.1 Invoice Status Subroute

**Subroute ID**: `status`
**Goal**: Check the status of an invoice or payment.

#### Steps

##### Single step: `ask_invoice_id`

**First turn** — asks for the invoice/order number:
```
Para consultar sua fatura, preciso do número da nota fiscal ou do pedido.

Pode me enviar?
```

**Second turn** — validates length (>= 3 chars), performs mock lookup, and returns a response with `done: true`:
```
Fatura #INV-2026-12345:

💰 Valor: R$ 350,00
📅 Vencimento: 15/02/2026
📊 Status: Pendente

Se precisar de mais alguma coisa, é só enviar uma mensagem!
```

**Mock status logic**: based on last digit of invoice ID:
- 0–3 → "Pendente" (with payment instructions)
- 4–6 → "Pago" (confirmation message)
- 7–9 → "Vencido" (overdue notice)

**Validation**: If input < 3 characters, asks again (with retry counter). After max retries, offers human handoff.

**For Production**: Replace mock with actual billing API call.

---

## Flow 3: General Support

**Flow ID**: `general_support`

**Description**: Catch-all for questions that don't fit other flows. Collects the user's problem, generates an LLM summary, and offers human handoff.

**Entry Triggers**:
- **Keywords**: "ajuda", "suporte", "dúvida", "problema"
- **LLM Classification**: When no other flow matches with confidence >= 0.80

**No subroutes** - Single linear flow (3 steps)

---

### Steps

##### Step 1: `start`

**Bot Message**:
```
Como posso ajudar você?

Por favor, descreva sua dúvida ou problema.
```

**Next Step**: `awaiting_problem`

---

##### Step 2: `awaiting_problem`

**Action**:
1. Takes the user's free-form problem description
2. Calls LLM (text mode, `maxTokens: 100`) to generate a brief summary of the problem
3. If LLM fails: truncates the original text to 50 chars as fallback summary
4. Stores both `problem` and `summary` in step data
5. Offers human handoff

**Bot Message**:
```
Entendo que você precisa de ajuda com *[LLM summary]*.

Para melhor atendê-lo, posso transferir você para um atendente humano.

Deseja falar com um atendente? (sim/não)
```

**Next Step**: `awaiting_handoff`

---

##### Step 3: `awaiting_handoff`

**Expected**: "sim", "não", or unclear input

**If SIM**:
- Generates a protocol ID
- Marks `handoff_requested: true` with timestamp in step data
- **Message**: "Entendido! Vou transferir você para um atendente humano.\n\nSeu protocolo de atendimento: *[PROTOCOL]*\n\nUm atendente entrará em contato em breve pelo WhatsApp."
- `done: true`

**If NÃO**:
- **Message**: "Obrigado! Se precisar de mais ajuda, é só me chamar."
- `done: true`

**If unclear**:
- **Message**: "Por favor, responda sim ou não. Deseja falar com um atendente?"
- Stays at `awaiting_handoff`

**Session Cleanup**: Standard (session cleared on `done: true`)

---

## Flow 4: Unknown (Conversational)

**Flow ID**: `unknown`

**Description**: Conversational LLM flow that handles ambiguous intents through natural dialogue, attempting to identify the user's need and hand off to the appropriate flow.

**Entry Triggers**:
- **LLM Classification**: Confidence < 0.80
- **Ambiguous input**: First message like "Oi", "Olá", "Preciso de ajuda"

**No subroutes** - Two steps, conversational

---

### Behavior

This is NOT a static menu. The unknown flow uses the LLM in text mode (`jsonMode: false`) to have a natural conversation with the user. On every turn it also runs `classifyFlow()` in the background to detect intent. When intent is detected with confidence >= 0.80, the step sets `_handoff_flow` in step data and `routeMessage` performs a seamless handoff to the target flow on the next message.

A static menu is only shown as a **fallback** when the LLM call fails or the conversation exceeds the turn limit.

**Turn limit**: 5 turns. After 5 turns without a confident classification, the flow shows the static menu and ends the session.

### Steps

##### Step 1: `start`

**Action**: Called on the first message.
1. Calls LLM (text mode) to generate a natural conversational reply
2. Runs `classifyFlow()` on the user's message
3. If classification confidence >= 0.80: returns `_handoff_flow` in data (handoff happens on next message)
4. If not: moves to `awaiting_reply` with `_turn_count: 1`
5. If LLM fails: falls back to static menu and ends session

##### Step 2: `awaiting_reply`

**Action**: Called on subsequent turns.
1. Increments turn count
2. Calls LLM (text mode) for a conversational reply
3. Runs `classifyFlow()` on the user's message
4. If classification confidence >= 0.80: returns `_handoff_flow` (handoff on next message)
5. If turn count >= 5: shows static menu and ends session (`done: true`)
6. Otherwise: continues conversation at `awaiting_reply`

**Static menu fallback**:
```
Como posso te ajudar?

1️⃣ Certificado Digital
2️⃣ Faturamento
3️⃣ Suporte Geral
```

**Handoff mechanism**: When `_handoff_flow` is set in step data, `routeMessage` detects it on the next cycle, clears the unknown session, and routes the user to the target flow (e.g. `digital_certificate`, `billing`, `general_support`).

---

## Validation & Error Handling

### Retry Logic

**Standard Retry Pattern** (for most steps):
1. **First invalid input**: Show error message, ask again with example
2. **Second invalid input**: Show more detailed error, emphasize format
3. **Third invalid input**: Offer human handoff or route to general_support

**Example** (for CPF validation):
```
Attempt 1: "O CPF deve ter 11 dígitos. Por favor, envie novamente."
Attempt 2: "O CPF deve conter exatamente 11 números. Exemplo: 12345678900"
Attempt 3: "Estou tendo dificuldade em validar seu CPF. Gostaria de falar com um atendente?"
```

### LLM Extraction Failures

**When LLM returns low confidence** (< 0.80):
- Don't trust extraction
- Ask again with more specific instructions
- Example: "Não entendi. Por favor, envie apenas os números do seu CPF."

**When LLM returns invalid JSON**:
- Fallback to pattern matching (regex)
- If regex also fails: ask again
- Log error for monitoring

**When repeated failures** (3+ times):
- Route to human handoff OR general_support
- Don't frustrate user with infinite retries

---

## Flow Transition Rules

### Topic Shift Detection

**When to check for topic shift**:
- User is in the middle of a flow
- User message contains strong keywords for different flow

**How it works**:
1. Run topic shift classifier (LLM)
2. If new flow detected with confidence >= 0.80:
   - Confirm with user (optional): "Parece que você quer [new topic]. Correto?"
   - Or automatically switch (simpler for MVP)
3. Clear previous flow state completely
4. Start new flow from beginning

**Example**:
```
Current flow: digital_certificate > purchase > ask_email
User: "Quanto custa o certificado?" (billing question)
→ Topic shift detected: "billing" (confidence: 0.85)
→ Switch to billing flow
→ Clear digital_certificate data
→ Start billing flow: ask_invoice_id
```

**Important**: Topic shift should be intentional, not accidental
- Use high confidence threshold (0.80+)
- Don't switch for every tangential mention

---

### Explicit Commands

**Reset/Cancel Commands** (detected before any flow routing):

| User Input | Action |
|------------|--------|
| "reiniciar", "começar de novo" | Clear session completely, send greeting |
| "cancelar", "desistir" | Clear session, thank user |
| "menu", "opções" | Show main menu (unknown flow step) |
| "falar com humano", "atendente" | Mark for human handoff, confirm |

**Implementation**:
```typescript
// Check for commands BEFORE flow routing
const command = detectCommand(userMessage);
if (command === 'reset') {
  await clearSession(userId);
  return sendGreeting(userId);
}
```

---

## Response Templates

### Greeting (First Message / New Session)

```
Olá! 👋 Sou o assistente virtual da [Nome da Empresa].

Posso ajudar com:
• Certificados Digitais (compra, renovação, suporte)
• Consultas de pagamento e faturas
• Suporte técnico e dúvidas

Como posso ajudar você hoje?
```

---

### Generic Error Message

**When external service fails** (Evolution API, Supabase, Groq):
```
Desculpe, estou com dificuldades técnicas no momento. 😔

Por favor, tente novamente em alguns minutos ou entre em contato pelo [telefone/email de suporte].
```

---

### Session Expired (Implicit)

**When user messages after 30+ min**:
- **Don't say**: "Sua sessão expirou"
- **Do**: Respond naturally as if new conversation
- **Example**:
  ```
  Olá novamente! Como posso ajudar?
  ```

---

### Rate Limit Exceeded

**When user sends > 10 messages/minute**:
```
Você está enviando mensagens muito rapidamente. ⏱️

Por favor, aguarde um momento antes de continuar.
```

**Important**: Send this message only ONCE per minute (don't spam)

---

### Media Message Received

**When user sends image/audio/video/document**:
```
Por favor, envie sua mensagem em formato de texto. 📝

No momento não consigo processar imagens, áudios ou documentos.
```

---

### Human Handoff Confirmation

**When user asks for human agent**:
```
Entendido! Vou transferir você para um atendente humano.

Seu protocolo de atendimento: [HUMAN-2026-XXXXX]

Um atendente entrará em contato em breve pelo WhatsApp ou email.
```

**Note**: For MVP, this just logs the request. Phase 2 will implement actual handoff.

---

## Data Collection Summary

### Digital Certificate Purchase
| Field | Type | Validation | Required |
|-------|------|------------|----------|
| person_type | PF \| PJ | Enum | ✅ |
| cpf_cnpj | string | 11 or 14 digits | ✅ |
| email | string | Valid email format | ✅ |
| phone | string | 10-11 digits | ✅ |
| protocol | string | Auto-generated | ✅ |

### Digital Certificate Renewal
| Field | Type | Validation | Required |
|-------|------|------------|----------|
| order_id | string | Alphanumeric | ❌ (optional) |
| cpf_cnpj | string | 11 or 14 digits | ✅ (if no order_id) |
| email | string | Valid email format | ✅ |
| protocol | string | Auto-generated | ✅ |

### Digital Certificate Support
| Field | Type | Validation | Required |
|-------|------|------------|----------|
| problem_description | string | Free-form | ✅ |
| order_id | string | Alphanumeric | ❌ |
| protocol | string | Auto-generated | ✅ |

### Billing Status Check
| Field | Type | Validation | Required |
|-------|------|------------|----------|
| invoice_id | string | Alphanumeric | ✅ |

---

## Testing Scenarios

### Happy Path - Digital Certificate Purchase
```
User: Oi
Bot: [Greeting + menu]
User: Preciso de certificado digital
Bot: [Enters digital_certificate flow, asks for subroute]
User: Quero comprar
Bot: [Asks person_type]
User: Pessoa física
Bot: [Asks CPF]
User: 123.456.789-00
Bot: [Asks email]
User: joao@example.com
Bot: [Asks phone]
User: (11) 99999-9999
Bot: [Shows confirmation]
User: Sim
Bot: [Success message with protocol]
```

### Error Recovery - Invalid CPF
```
User: Quero comprar certificado
Bot: [Asks person_type]
User: PF
Bot: [Asks CPF]
User: 123
Bot: [Error: CPF must be 11 digits]
User: 12345678900
Bot: [Success, asks email]
```

### Topic Shift - Mid-conversation
```
Current: digital_certificate > purchase > ask_email
User: Quanto custa?
Bot: [Detects topic shift to billing]
Bot: Para consultar valores, preciso do número do pedido...
```

### Session Expiry
```
User starts conversation, collects CPF
[30+ minutes pass]
User: Qual era meu protocolo?
Bot: [Treats as new session]
Bot: Olá! Para consultar um protocolo, preciso do número dele...
```

---

## Implementation Checklist

### Phase 1 - Digital Certificate Purchase (MVP)
- [x] Implement all 6 steps (ask_person_type → done)
- [x] LLM extraction for CPF/CNPJ, email, phone
- [x] Validation logic with retry handling
- [x] Confirmation step with data masking
- [x] Protocol number generation
- [x] Session state persistence

### Phase 2 - Other Digital Certificate Subroutes
- [x] Renewal flow
- [x] Support flow
- [x] Requirements flow
- [x] Status flow (single-step with mock lookup)
- [x] Subroute selection via LLM

### Phase 3 - Billing Flow
- [x] Invoice status lookup (single-step with mock data)
- [x] Mock billing data for testing
- [ ] Integration with real billing API (production)

### Phase 4 - Support Flows
- [x] General support flow (LLM summary + human handoff)
- [x] Unknown/conversational flow (LLM-driven with handoff)
- [x] Human handoff marking (phase 2: actual handoff)

### Phase 5 - Advanced Features
- [x] Topic shift detection
- [ ] Command detection (reset, cancel, menu)
- [x] Session expiry handling
- [ ] Rate limiting response

---

## Future Enhancements

### Near-term
1. **Rich Media Support**:
   - Accept images for document upload (in support flow)
   - Send confirmation with WhatsApp buttons (Evolution API feature)
2. **Smart Clarification**:
   - Instead of asking "which field is wrong?", let user say "o email está errado"
   - Use LLM to parse correction intent
3. **Conversation Context**:
   - Remember user's previous protocols
   - Proactive: "Vejo que você comprou um certificado em Jan. Quer renovar?"
4. **Command Detection**:
   - Reset/cancel commands ("reiniciar", "cancelar")
   - Menu command ("menu", "opções")
5. **Rate Limiting**:
   - Throttle rapid message senders

### Long-term
1. **Multi-language**:
   - Detect language (Portuguese vs English)
   - Localized responses
2. **Sentiment Analysis**:
   - Detect frustrated users
   - Prioritize for human handoff
3. **A/B Testing**:
   - Test different question phrasings
   - Optimize for completion rate

---

## Appendix: LLM Prompt Templates

### Global Router Prompt
```
System: You are a conversation router for a digital certificate and support company.
Classify the user's intent into ONE of these flows:
- digital_certificate: User needs help with digital certificates (purchase, renewal, support)
- billing: User has questions about invoices, payments, or pricing
- general_support: General questions that don't fit the above
- unknown: Cannot determine intent clearly

Recent conversation history (last 5 messages):
{chat_history}

User's current message:
"{user_message}"

Respond ONLY with valid JSON (no markdown, no explanation):
{
  "flow": "digital_certificate" | "billing" | "general_support" | "unknown",
  "confidence": 0.0-1.0,
  "reason": "Brief explanation (max 200 chars)"
}
```

### Subroute Router Prompt (Digital Certificate)
```
System: User is in the DIGITAL_CERTIFICATE flow. Classify their intent into a subroute:
- purchase: Buy a new digital certificate
- renewal: Renew an existing certificate
- support: Technical issues, problems, or help
- requirements: Ask what documents/information are needed
- status: Check the status of an existing order

User's message:
"{user_message}"

Respond ONLY with valid JSON:
{
  "subroute": "purchase" | "renewal" | "support" | "requirements" | "status" | null,
  "confidence": 0.0-1.0,
  "reason": "Brief explanation"
}
```

### Data Extraction Prompt (CPF/CNPJ, Email, Phone)
```
System: Extract the following information from the user's message:
- email: Valid email address (or null if not found)
- cpf_cnpj: Digits only, 11 for CPF or 14 for CNPJ (or null if not found)
- phone: Digits only, 10-11 digits (or null if not found)

User's message:
"{user_message}"

Respond ONLY with valid JSON:
{
  "email": "user@example.com" | null,
  "cpf_cnpj": "12345678900" | null,
  "phone": "11999999999" | null,
  "confidence": 0.0-1.0,
  "missing_fields": ["email", "phone"]  // List fields not found
}
```

---

**End of Flow Specifications**

For implementation details, see:
- [CLAUDE.md](CLAUDE.md) - Architecture rules
- [PLAN.md](PLAN.md) - Implementation phases
- [ARCHITECTURE.md](ARCHITECTURE.md) - System design
- [ENVIRONMENT.md](ENVIRONMENT.md) - Development setup
