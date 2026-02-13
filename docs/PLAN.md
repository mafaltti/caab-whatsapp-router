# Complete and detailed plan (Next.js + Vercel deployment)

## Phase 0 — Bootstrap Next.js + TypeScript Project ✅
**Goal:** Set up Next.js app with TypeScript, dev environment, and basic structure.

### Prerequisites
- Node.js 18+
- Docker Desktop (required for local Supabase)
- Supabase CLI (`npm install -g supabase`)

### Setup Steps
1. Create Next.js app:
   ```bash
   npx create-next-app@latest caab-whatsapp-router
   # Choose: TypeScript, App Router, src/ directory, Tailwind (optional)
   ```

2. Install dependencies:
   ```bash
   npm install @supabase/supabase-js zod groq-sdk
   npm install -D @types/node
   ```

3. Initialize Supabase (creates `supabase/` folder with `config.toml`):
   ```bash
   supabase init
   ```

4. Start local Supabase (requires Docker Desktop running):
   ```bash
   supabase start
   # Local services:
   #   API URL: http://localhost:54321
   #   Studio:  http://localhost:54323
   #   DB URL:  postgresql://postgres:postgres@localhost:54322/postgres
   ```

5. Setup environment variables:
   - Create `.env.local` with local Supabase URLs (from `supabase status` output)
   - Create `.env.example` as template (no secrets)

6. Create directory structure:
   ```
   src/
     app/
       api/
         health/route.ts
         webhook/evolution/route.ts
     lib/
       db/, llm/, flows/, evolution/, shared/
   ```

7. Create health check endpoint: `GET /api/health`
   Returns `{"status": "ok", "timestamp": "..."}`

**Exit Criteria**
- `npm run dev` starts Next.js on http://localhost:3000
- `supabase start` runs local Supabase successfully
- Local Studio accessible at http://localhost:54323
- `GET /api/health` returns successful response
- TypeScript compiles without errors

---

## Phase 0.5 — Multi-Environment Supabase Setup ✅
**Goal:** Configure separate Supabase projects for staging and production, aligned with [Supabase Managing Environments](https://supabase.com/docs/guides/deployment/managing-environments) guidelines.

### Environment Mapping
| Environment | Git Branch | Supabase | Vercel |
|-------------|------------|----------|--------|
| Local Dev | feature/* | Docker (`supabase start`) | localhost:3000 |
| Staging | develop | Staging Supabase project | Preview URL |
| Production | main | Production Supabase project | Production URL |

### Setup Steps
1. Create two Supabase projects in dashboard:
   - `caab-whatsapp-router-staging` (free tier)
   - `caab-whatsapp-router-prod` (free tier or pro)

2. Create `develop` branch:
   ```bash
   git checkout -b develop
   git push -u origin develop
   ```

3. Configure GitHub repository secrets (Settings → Secrets → Actions):
   - `SUPABASE_ACCESS_TOKEN` — Personal access token from supabase.com/dashboard/account/tokens
   - `SUPABASE_DB_PASSWORD_STAGING` — Staging project database password
   - `SUPABASE_DB_PASSWORD_PRODUCTION` — Production project database password
   - `STAGING_PROJECT_ID` — Staging project ref (from dashboard URL)
   - `PRODUCTION_PROJECT_ID` — Production project ref (from dashboard URL)

4. Create GitHub Actions workflows (see `.github/workflows/`):
   - `ci.yml` — Validate types and lint on PRs
   - `staging.yml` — Auto-deploy migrations on merge to develop
   - `production.yml` — Auto-deploy migrations on merge to main

**Exit Criteria**
- Local Supabase runs via Docker (`supabase start`)
- Staging and production Supabase projects created
- GitHub secrets configured
- GitHub Actions deploy migrations automatically on branch merges

---

## Phase 1 — Supabase schema + repositories ✅
**Goal:** reliable persistence for state, history, and idempotency.

- Create `supabase/migrations/YYYYMMDD001_init.sql` (use `supabase migration new init`):
  - `conversation_state` (add `active_subroute`)
  - `chat_messages` + unique index on `message_id`
- Test locally with `supabase db reset` (rebuilds local DB and applies all migrations)
- Generate TypeScript types from schema:
  ```bash
  supabase gen types typescript --local > src/lib/db/types.ts
  ```
- Create `supabase/seed.sql` with test data (sample conversation_state, chat_messages)
- Implement Supabase client with service role key.
- Implement repositories:
  - `getSession(userId)`
  - `upsertSession(session)`
  - `clearSession(userId)`
  - `insertInboundIfNew(message_id, ...)` → returns boolean (new vs duplicate)
  - `insertOutbound(...)`
  - `loadRecentMessages(userId, limit)`

**Exit criteria**
- Duplicate `message_id` is rejected/ignored
- Session upsert + TTL works
- `supabase db reset` applies migrations and seed data locally
- TypeScript types are generated and match schema

---

## Phase 2 — Webhook Endpoint + Evolution API Normalization ✅
**Goal:** Receive Evolution webhooks and normalize to internal format.

### Implementation
1. **Create webhook endpoint**: `src/app/api/webhook/evolution/route.ts`
   - Implement `POST` handler
   - Return 200 OK quickly (serverless timeout limit: 30s)

2. **Implement normalization** (`src/lib/webhook/normalize.ts`):
   ```typescript
   interface NormalizedMessage {
     userId: string;           // digits only from sender
     messageId: string;        // data.key.id
     instanceName: string;     // instance
     text: string;            // extracted text
     fromMe: boolean;         // data.key.fromMe
     isGroup: boolean;        // remoteJid check
     timestamp: Date;
   }
   ```

3. **Extraction logic**:
   - Text from: `message.conversation` OR `message.extendedTextMessage.text`
   - Handle quoted messages (extract new text only)
   - Normalize whitespace and trim
   - Handle empty/null text gracefully

4. **Guards** (apply BEFORE any processing):
   - Ignore if `fromMe === true`
   - Ignore if `remoteJid.endsWith('@g.us')` (groups)
   - Ignore if `remoteJid.endsWith('@lid')` (communities)
   - Ignore if no text content (images, audio, etc.)
   - Send auto-reply for media messages

5. **Setup ngrok for local testing**:
   ```bash
   ngrok http 3000
   # Update Evolution webhook URL to: https://xxx.ngrok.io/api/webhook/evolution
   ```

**Exit Criteria**
- Real WhatsApp message triggers webhook successfully
- Normalized payload has correct `userId` and `text`
- Group messages and `fromMe` messages are ignored
- Media messages receive auto-reply and are ignored

---

## Phase 3 — Processing pipeline (guards + dedupe + history) ✅
**Goal:** safe, idempotent processing.

Order of operations per message:
1) Ignore `fromMe=true`
2) Optional ignore group
3) **Dedupe**: insert inbound message with unique `message_id`
4) Save inbound message text (if new)
5) Load session state

**Exit criteria**
- Retry storms don’t cause multiple replies

---

## Phase 4 — Routing layer A: topic shift + global flow selection ✅
**Goal:** choose the correct top-level flow even mid-conversation.

Implement:
- **Rule-based interrupt detector** (cheap, fast):
  - keywords for billing/payment, certificate, human/attendant, etc.
- **LLM topic shift classifier** (only if ambiguous):
  - returns `{flow, confidence}`
  - if `confidence >= 0.80` switch flow + reset `active_subroute=null, step="start", data={}`

Also implement initial global routing for new sessions:
- If no active session or session expired:
  - LLM global router returns `flow`
  - if unknown/low confidence → ask a clarifying question

**Exit criteria**
- User can switch topics mid-flow reliably

---

## Phase 4.5 — Groq LLM Integration ✅
**Goal:** Implement LLM client with rotating API keys and strict validation.

### Implementation
1. **Create Groq client** (`src/lib/llm/client.ts`):
   - Key rotation logic (round-robin through `GROQ_API_KEYS`)
   - Retry on 429 errors with next key
   - 8-second timeout per request
   - JSON response parsing with error handling

2. **Create Zod schemas** (`src/lib/llm/schemas.ts`):
   ```typescript
   const GlobalRouterSchema = z.object({
     flow: z.enum(['digital_certificate', 'billing', 'general_support', 'unknown']),
     confidence: z.number().min(0).max(1),
     reason: z.string().max(200)
   });

   const SubrouteRouterSchema = z.object({
     subroute: z.string().nullable(),
     confidence: z.number().min(0).max(1),
     reason: z.string().max(200)
   });

   const DataExtractionSchema = z.object({
     person_type: z.enum(['PF', 'PJ']).nullable(),
     cpf_cnpj: z.string().nullable(),
     email: z.string().email().nullable(),
     phone: z.string().nullable(),
     confidence: z.number().min(0).max(1),
     missing_fields: z.array(z.string())
   });
   ```

3. **Create router functions**:
   - `globalRouter.ts`: Top-level flow selection (uses chat history)
   - `subrouteRouter.ts`: In-flow subroute selection
   - `extractors.ts`: Data extraction (CPF, email, phone)

4. **Prompt templates** (`src/lib/llm/prompts.ts`):
   - Use system + user message format
   - Include few-shot examples for better classification
   - Include recent conversation history (last 5 messages) for context
   - Emphasize JSON-only output

**Exit Criteria**
- Can call Groq API successfully with model llama-3.3-70b-versatile
- Key rotation works automatically on 429 errors
- Invalid JSON responses are caught and handled gracefully
- All LLM responses validated with Zod before use
- Confidence thresholds work (0.80+ accept, below ask clarification)

---

## Phase 5 — Flow framework + deterministic step machine ✅
**Goal:** a consistent way to implement flows/subroutes/steps.

Implement a standard handler signature, e.g.:

- `handleMessage({ state, text }) -> { reply, nextState, done }`

Where `nextState` includes:
- `active_flow`
- `active_subroute`
- `step`
- `data`

**Exit criteria**
- One flow can run multi-turn without LLM “driving” steps

---

## Phase 6 — Digital Certificate Flow Implementation ✅
**Goal:** Complete end-to-end flow for digital certificate requests with all subroutes.

### Flow Structure
**Flow ID**: `digital_certificate`

**Subroutes** (LLM decides based on user intent):
1. `purchase` - Buy new certificate
2. `renewal` - Renew existing certificate
3. `support` - Technical support issues
4. `requirements` - Information about what's needed
5. `status` - Check order status

### Implementation Details

#### Purchase Subroute (Most Complex)
Steps in order:
1. **ask_person_type**: "Você é pessoa física ou jurídica?"
   - LLM extraction to normalize to "PF" or "PJ"
   - Store in `data.person_type`

2. **ask_cpf_cnpj**: "Por favor, envie seu [CPF/CNPJ]"
   - LLM extraction of digits from free-form text
   - Validate: CPF=11 digits, CNPJ=14 digits
   - Basic validation (not all same digit)
   - Max 3 retries, then offer human handoff
   - Store in `data.cpf_cnpj`

3. **ask_email**: "Qual é seu melhor email para contato?"
   - LLM extraction (handles "meu email é..." etc.)
   - Validate contains @ and domain
   - Store in `data.email`

4. **ask_phone**: "Qual é seu telefone com DDD?"
   - LLM extraction, accept with/without formatting
   - Validate 10-11 digits
   - Store in `data.phone`

5. **confirm**: Show summary, ask "Está correto? (sim/não)"
   - If yes → send success message, generate protocol ID
   - If no → ask which field to correct, route back

6. **done**: Final confirmation message with protocol number

#### Other Subroutes (Simplified for MVP)
- **renewal**: ask_order_id → ask_email → confirm → done
- **support**: ask_problem → ask_order_id (optional) → confirm → done
- **requirements**: show_requirements_info → offer to start purchase → done
- **status**: ask_order_id → lookup_status (mock) → show_status → done

### Subroute Selection
- When user enters flow, LLM determines subroute
- If confidence < 0.80, ask clarifying question
- User can switch subroutes mid-flow if detected

**Exit Criteria**
- User can complete full purchase flow end-to-end
- All data fields are correctly extracted and validated with LLM
- Subroute selection works via LLM classification
- Session persists across multiple messages
- Can handle flow completion and session cleanup
- CPF/CNPJ validation works correctly

---

## Phase 7 — Evolution Outbound Messaging Client
**Goal:** Reliable sending with proper error handling for serverless environment.

### Implementation (`src/lib/evolution/client.ts`)
- Implement `sendText(instance, number, text)` function
  - POST to Evolution API `/message/sendText` endpoint
  - 5-second timeout (fail fast in serverless)
  - NO automatic retries (serverless constraint)
  - Return success/failure status

- Error handling:
  - Log all errors with full context
  - On failure, log but don't crash
  - User gets generic error message if send fails

- Message persistence:
  - Save to `chat_messages` AFTER successful send
  - Mark as direction='out', message_id=null
  - Include full text for audit trail

**Exit Criteria**
- Can send text messages successfully via Evolution API
- Errors are logged but don't crash the application
- Outbound messages are saved to database for audit
- Timeout works correctly (doesn't hang)

---

## Phase 8 — LLM implementation (providers + schemas + prompts) ✅
**Goal:** stable JSON outputs and safe fallbacks.

- Centralize:
  - prompts (global router, topic shift, per-flow subroute router, extraction)
  - Zod schemas for each response
  - parsing + fallback behavior
- Set `temperature=0`.
- Always validate:
  - invalid JSON → fallback
  - low confidence → clarifying question / human flow

**Exit criteria**
- Router never crashes on weird LLM output

---

## Phase 9 — Billing/Payment Flow (Second Priority)
**Goal:** Implement invoice status checking flow.

### Flow Structure
**Flow ID**: `billing`
**Subroute**: `status` (only subroute for MVP)

### Steps
1. **ask_invoice_id**: "Para consultar sua fatura, preciso do número da nota fiscal ou do pedido."
   - LLM extraction of order/invoice ID
   - Store in `data.invoice_id`

2. **lookup_invoice**: Query billing system (mock for MVP)
   - Mock response with status, value, due date
   - Real implementation would call billing API

3. **show_status**: Display invoice information
   - Status: Pago / Pendente / Vencido
   - Amount and due date
   - Payment instructions if pending

4. **done**: "Posso ajudar com mais alguma coisa?"

### Entry Triggers
- Keywords: "boleto", "pagamento", "fatura", "cobrança"
- LLM classification from global router

**Exit Criteria**
- User can check invoice status by providing ID
- Mock data is returned correctly
- Flow completes and session is handled properly

---

## Phase 9.5 — General Support & Unknown Flows
Implement catch-all flows:
- `general_support`: Generic questions, offer human handoff
- `unknown`: Clarification questions when LLM can't classify

Each follows same pattern:
- Simple linear steps (no subroutes)
- Quick resolution or escalation
- TTL-based session cleanup

---

## Phase 10 — Operational Hardening & Deployment
**Goal:** Production readiness for Vercel deployment.

### Logging
- Implement structured JSON logging (`src/lib/shared/logger.ts`)
  - Correlation ID per webhook call
  - Log levels: debug, info, warn, error
  - Events: webhook_received, llm_call, flow_transition, message_sent, error
  - **PII-safe**: Don't log full message content, CPF/CNPJ, emails in production

### Rate Limiting
- Implement per-user rate limiting:
  - 10 messages per minute
  - 100 messages per hour
  - Use Supabase or Vercel KV for counter storage
  - Send single warning message when limit exceeded

### User Commands
- **"reiniciar" / "começar de novo"**: Clear user session, start fresh
- **Detect and handle these keywords before flow routing**

### CI/CD Pipeline (GitHub Actions + Supabase)
Following [Supabase Managing Environments](https://supabase.com/docs/guides/deployment/managing-environments):
- **PRs**: CI validates TypeScript types match schema (`supabase gen types typescript`)
- **Merge to develop**: Auto-deploy migrations to staging Supabase project
- **Merge to main**: Auto-deploy migrations to production Supabase project
- **Never** run `supabase db push` directly on production

### Vercel Deployment
- Push to GitHub repository
- Connect to Vercel dashboard
- Configure environment variables per environment (staging vs production)
- Vercel auto-deploys: develop → preview, main → production
- Configure custom domain (optional)

### Git Branching Strategy
```
feature/xyz → develop (staging) → main (production)
```
- Feature branches: local Supabase (Docker)
- Develop branch: staging Supabase project + Vercel preview
- Main branch: production Supabase project + Vercel production

### Monitoring (Manual for MVP)
- Review Vercel function logs daily
- Check Groq dashboard for API usage
- Monitor Supabase for slow queries
- Track error rates manually

**Exit Criteria**
- Application deployed to Vercel successfully
- GitHub Actions deploy migrations automatically
- TypeScript types validated in CI
- Environment variables configured per environment
- Rate limiting works correctly
- Logging outputs structured JSON
- Can handle session reset command

---

## Phase 11 — Testing & Verification
**Goal:** Ensure system works end-to-end with real Evolution API.

### Manual Testing (Primary Strategy)
Test with real WhatsApp messages through Evolution API:

1. **Basic Guards**:
   - Send message from self → verify ignored (fromMe)
   - Send message to group → verify ignored
   - Send image/audio → verify auto-reply sent
   - Send same message twice → verify no double-processing

2. **Flow Testing - Digital Certificate**:
   - New user says "Oi" → gets greeting
   - User says "preciso de certificado digital" → enters flow
   - User says "quero comprar" → enters purchase subroute
   - Complete full purchase flow with valid data
   - Test invalid CPF → verify retry logic
   - Test email extraction from "meu email é user@example.com"

3. **Flow Testing - Billing**:
   - User says "quero ver minha fatura" → enters billing flow
   - Provide invoice ID → see mocked status

4. **Topic Shifting**:
   - Start in digital_certificate flow
   - Mid-conversation say "quero ver minha fatura"
   - Verify flow switches to billing

5. **Session Management**:
   - Complete a flow → verify session cleanup
   - Wait 30+ minutes → send message → verify fresh session
   - Send "reiniciar" → verify session cleared

6. **Rate Limiting**:
   - Send 11 messages quickly → verify rate limit message
   - Wait 1 minute → verify can send again

### Unit Tests (Optional, Add Later)
If time permits, add tests for:
- Payload normalization (`normalize.ts`)
- LLM response validation with Zod
- Step transition logic

**Exit Criteria - Manual Testing**
- All guards work correctly (fromMe, groups, media)
- Can complete full digital_certificate purchase flow
- Can complete billing status check
- Topic shifting works reliably
- Session expiry and reset work
- Rate limiting activates correctly
- No crashes or unhandled errors in production logs
