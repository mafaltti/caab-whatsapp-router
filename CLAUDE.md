# Project: WhatsApp Assistant Router (Evolution API v2) + Supabase + LLM + State Machine

## Objective
Build a webhook-driven WhatsApp assistant that:
- Receives Evolution API `messages.upsert` webhooks
- Persists session state + message history in Supabase
- Routes messages to a top-level flow (e.g., digital_certificate, sales, support)
- Within a flow, routes to subroutes (e.g., purchase vs support vs renewal)
- Runs deterministic step-machines for multi-turn conversations
- Sends replies via Evolution API `sendText`

---

## Non-Negotiable Rules (Do Not Break)
1) Ignore outgoing messages to prevent loops:
   - If `data.key.fromMe === true`, do nothing.
2) Dedupe before processing:
   - Use `data.key.id` as `message_id` and enforce idempotency.
   - Do NOT send to `remoteJid` when it ends with `@lid`.
4) Persist and load state on every message:
   - No in-memory session reliance (server restarts must not break flow).
5) LLM output must be strict JSON and validated (Zod). If invalid → safe fallback.
6) LLM never triggers side-effects directly:
   - LLM classifies/extracts; code decides next step, writes DB, calls APIs.
7) All secrets come from env vars (never hardcode keys).

---

## Data Model (Supabase)
### Table: conversation_state
Primary key: user_id (digits only, derived from sender)
Columns:
- user_id (PK)
- instance
- active_flow           (e.g. "digital_certificate")
- active_subroute       (e.g. "purchase" | "support" | null)
- step                  (e.g. "ask_cpf")
- data (jsonb)          (collected fields)
- updated_at
- expires_at            (TTL, default 30 minutes inactivity)

### Table: chat_messages
Stores history (optional for routing quality + audits):
- id (PK)
- user_id
- instance
- direction ("in"|"out")
- message_id (unique where not null)
- text
- created_at

Indexes:
- unique(message_id) where not null
- (user_id, created_at desc)

---

## Routing Design (Multi-Layer LLM Allowed)
We use LLMs at multiple layers, but ALWAYS as a classifier/extractor:

### Layer A: Topic Shift / Global Flow Selection
When a message arrives:
1) If there is an active session, first run a cheap rule-based interrupt check.
2) If still ambiguous, run an LLM "topic shift" classifier:
   - If user intent strongly indicates a different top-level flow (>= 0.80), switch flow and reset subroute/step.
   - Else continue current flow.

### Layer B: In-Flow Subroute Selection
Inside an active flow (e.g., digital_certificate), the flow may run an LLM to decide:
- subroute: purchase vs renewal vs support vs status vs requirements
This sets `active_subroute` and typically resets `step` to that subroute’s start.

### Layer C: Extraction
Optionally use LLM to extract structured fields from free-form text (CPF, email, name, orderId).
Extraction must also be strict JSON + validated.

---

## LLM Contracts (Groq + Llama 3.3 70B)

### Provider Configuration
- **Provider**: Groq
- **Model**: llama-3.3-70b-versatile
- **API Keys**: Rotating array (free tier workaround)
- **Temperature**: 0 (deterministic outputs)
- **Max Tokens**: 500 (classification should be concise)
- **Timeout**: 8 seconds

### Key Rotation Strategy
```typescript
const GROQ_API_KEYS = process.env.GROQ_API_KEYS!.split(',');
let currentKeyIndex = 0;

function getNextApiKey() {
  const key = GROQ_API_KEYS[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % GROQ_API_KEYS.length;
  return key;
}

// On 429 error, immediately try next key
```

### Response Format: Global Router
Input: User message + recent chat history (last 5 messages)
Output (strict JSON):
```json
{
  "flow": "digital_certificate" | "billing" | "general_support" | "unknown",
  "confidence": 0.95,
  "reason": "User mentioned needing a certificate"
}
```

Validation with Zod:
```typescript
const GlobalRouterSchema = z.object({
  flow: z.enum(['digital_certificate', 'billing', 'general_support', 'unknown']),
  confidence: z.number().min(0).max(1),
  reason: z.string().max(200)
});
```

### Response Format: Subroute Router (Digital Certificate)
```json
{
  "subroute": "purchase" | "renewal" | "support" | "requirements" | "status" | null,
  "confidence": 0.88,
  "reason": "User wants to buy new certificate"
}
```

### Response Format: Data Extraction
```json
{
  "person_type": "PF" | "PJ" | null,
  "cpf_cnpj": "12345678900",
  "email": "user@example.com",
  "phone": "11999999999",
  "confidence": 0.92,
  "missing_fields": ["email"]
}
```

### Confidence Thresholds
- `>= 0.80`: Accept classification/extraction
- `0.60 - 0.79`: Ask clarifying question
- `< 0.60`: Route to "unknown" or ask open-ended question

### Fallback on Invalid JSON
If LLM returns non-JSON or invalid schema:
1. Log the error with full response
2. Route to "unknown" flow
3. Ask user: "Desculpe, não entendi. Pode reformular sua mensagem?"

---

## Error Handling & Resilience

### External Service Failures
When Evolution API, Supabase, or Groq fail:
1. **Log the error** with correlation ID and full context
2. **Send user-facing message**: "Desculpe, estou com dificuldades técnicas no momento. Por favor, tente novamente em alguns minutos."
3. **Do NOT retry automatically** (serverless timeout constraints)
4. **Monitor error rates** - if > 5% errors in 5 min, alert required

### Groq Rate Limiting (Free Tier)
- Rotate between multiple API keys on 429 errors
- Keys array in env: `GROQ_API_KEYS` (comma-separated)
- Round-robin or random selection per request
- Fall back to error message if all keys exhausted

### Database Connection
- Use Supabase connection pooling (serverless mode)
- Set statement_timeout=10s to prevent long-running queries
- Retry policy: None (fail fast in serverless)

### Timeout Configuration
- Webhook handler: max 25s (Vercel limit: 30s)
- LLM calls: 8s timeout
- Evolution sendText: 5s timeout
- Database queries: 10s timeout

---

## Message Type Handling

### Non-Text Messages
The bot ONLY processes text messages. Other types are handled as follows:

| Message Type | Action |
|--------------|--------|
| Image | Ignore + auto-reply |
| Audio/Voice | Ignore + auto-reply |
| Video | Ignore + auto-reply |
| Document | Ignore + auto-reply |
| Sticker | Ignore silently |
| Location | Ignore + auto-reply |
| Contact | Ignore + auto-reply |

**Auto-reply message**: "Por favor, envie sua mensagem em formato de texto. No momento não consigo processar imagens, áudios ou documentos."

### Text Message Variations
Process these as normal text:
- Plain text messages
- Text with emojis
- Messages with links
- Quoted/replied messages (extract only the new text)

---

## Group Message Handling

**Rule**: Ignore ALL group messages completely.

Detection:
- `remoteJid.endsWith("@g.us")` → ignore
- `remoteJid.endsWith("@lid")` → ignore (WhatsApp community)

Do NOT:
- Process group messages
- Send replies to groups
- Save group messages to database

Rationale:
- Prevents unwanted public responses
- Avoids spam/abuse scenarios
- Simplifies context management
- Protects user privacy

---

## Rate Limiting

### Per-User Limits (MVP)
- **10 messages per minute**
- **100 messages per hour**

Implementation:
- Store counter in Supabase or in-memory cache (Vercel KV if available)
- Key format: `ratelimit:{user_id}:{minute|hour}`
- TTL: 60s for minute counter, 3600s for hour counter

### Rate Limit Response
When limit exceeded:
- **Do NOT process the message**
- **Send one reply**: "Você está enviando mensagens muito rapidamente. Por favor, aguarde um momento."
- **Log the event** (track abuse patterns)
- **Do NOT send this message more than once per minute** (avoid spam)

### Future Enhancements (Post-MVP)
- Per-flow limits (stricter for expensive operations)
- Global instance limits (protect infrastructure)
- Whitelist for VIP users

---

## Session Expiry Behavior

### Expiry Rules
- **TTL**: 30 minutes from last message
- **Storage**: `expires_at` timestamp in conversation_state
- **Check**: On every message, compare now > expires_at

### When Session Expires
1. **Clear the session completely**:
   - Delete or mark conversation_state record as expired
   - Keep chat_messages for audit (optional retention policy)
2. **Treat user as new**:
   - Run global flow router
   - Start from step="start"
   - No reference to previous conversation
3. **No notification to user**:
   - Don't mention "your session expired"
   - Just respond naturally to their new message

### Edge Case: Message During Expiry
If a message arrives exactly at expiry time, treat as new session (no grace period).

---

## Observability & Monitoring

### Required Metrics (Log to stdout in JSON format)
```json
{
  "level": "info|warn|error",
  "timestamp": "ISO8601",
  "correlation_id": "unique per webhook",
  "user_id": "digits only",
  "instance": "evolution instance name",
  "event": "webhook_received|llm_call|flow_transition|message_sent|error",
  "flow": "current flow name",
  "step": "current step",
  "duration_ms": 123,
  "error": "error message if applicable"
}
```

### Key Events to Log
1. **webhook_received**: Every incoming message
2. **llm_call**: Every LLM request (prompt type, tokens, latency, confidence)
3. **flow_transition**: Flow or step changes
4. **message_sent**: Every outbound message
5. **error**: Any error (with full stack trace)
6. **rate_limit_hit**: When user hits rate limit

### What NOT to Log
- Full message content (PII risk)
- API keys or secrets
- CPF/CNPJ values
- Email addresses in logs

### Monitoring Alerts (Manual Review for MVP)
- Error rate > 5% in 5 minutes
- LLM latency > 5 seconds
- Database query > 2 seconds

---

## Step Machine Contract
State machine key fields:
- active_flow
- active_subroute (optional)
- step
- data

Every inbound message execution MUST:
1) Normalize payload + guards (fromMe, groups optional)
2) Dedupe by message_id
3) Load conversation_state
4) Decide:
   - Continue current flow OR switch flow (topic shift)
   - Select subroute if required by flow
   - Run deterministic step handler
5) Upsert session with TTL (expires_at = now + 30min) unless done
6) Send reply via Evolution
7) Save outbound message to chat_messages

---

## Suggested Project Structure (Next.js)
```
supabase/
  config.toml                    (Supabase CLI config, created by supabase init)
  migrations/
    YYYYMMDD001_init.sql         (database schema migration)
  seed.sql                       (test data for local development)

src/
  app/
    api/
      health/
        route.ts                 (health check endpoint)
      webhook/
        evolution/
          route.ts               (POST /api/webhook/evolution)
    page.tsx                     (optional: status page)
  lib/
    webhook/
      normalize.ts               (Evolution payload normalization)
    db/
      supabase.ts                (Supabase client)
      sessionRepo.ts             (conversation_state operations)
      messageRepo.ts             (chat_messages operations)
      types.ts                   (auto-generated: supabase gen types typescript)
    evolution/
      client.ts                  (sendText, API calls)
    llm/
      client.ts                  (Groq client with key rotation)
      prompts.ts                 (prompt templates)
      schemas.ts                 (Zod validation schemas)
      globalRouter.ts            (top-level flow selection)
      topicShift.ts              (detect topic changes)
      subrouteRouter.ts          (in-flow subroute selection)
      extractors.ts              (CPF, email, phone extraction)
    flows/
      index.ts                   (flow registry)
      digitalCertificate/
        flow.ts                  (main flow handler)
        subroutes.ts             (purchase, renewal, support, etc.)
        steps.ts                 (step-by-step logic)
      billing/
        flow.ts
        steps.ts
      generalSupport/
        flow.ts
      unknown/
        flow.ts
    shared/
      logger.ts                  (structured logging)
      time.ts                    (date/time utilities)
      errors.ts                  (error types)
      types.ts                   (shared TypeScript types)

.github/
  workflows/
    ci.yml                       (PR validation: lint + type check)
    staging.yml                  (deploy migrations to staging on develop merge)
    production.yml               (deploy migrations to production on main merge)

.env.local                       (local environment variables)
.env.example                     (template for env vars)
```

---

## Environment Variables

### Application (`.env.local` / Vercel Dashboard)
Required:
- `SUPABASE_URL` - Supabase project URL (local: http://localhost:54321)
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (not anon key)
- `EVOLUTION_BASE_URL` - Evolution API base URL (e.g., https://api.evolution.com)
- `EVOLUTION_API_KEY` - Evolution API authentication key
- `EVOLUTION_INSTANCE` - Evolution instance name
- `GROQ_API_KEYS` - Comma-separated Groq API keys for rotation (e.g., "key1,key2,key3")

Optional:
- `WEBHOOK_SECRET` - Optional secret for webhook validation
- `LOG_LEVEL` - Logging level (debug|info|warn|error, default: info)
- `NODE_ENV` - Environment (development|production)
- `PORT` - Local development port (Next.js default: 3000)

### CI/CD (GitHub Secrets only — never in code)
- `SUPABASE_ACCESS_TOKEN` - Personal access token (supabase.com/dashboard/account/tokens)
- `SUPABASE_DB_PASSWORD_STAGING` - Staging project database password
- `SUPABASE_DB_PASSWORD_PRODUCTION` - Production project database password
- `STAGING_PROJECT_ID` - Staging Supabase project ref
- `PRODUCTION_PROJECT_ID` - Production Supabase project ref

---

## Acceptance Tests (Must Pass)
1) fromMe=true webhook → no processing, no reply.
2) Same message_id delivered twice → second run does nothing.
3) New user: "Oi" → global router returns unknown/human → bot asks what they need.
4) User: "Preciso de certificado digital" → flow switches to digital_certificate.
5) Inside digital_certificate:
   - "Quero comprar" routes to subroute purchase, step machine begins.
   - "Estou com problema" routes to subroute support.
6) User changes topic mid-flow:
   - while in digital_certificate, user says "quero comprar" → switches to sales if confidence >= 0.80.

---

## How Claude Should Work in This Repo
- Implement in this order: DB schema → webhook normalize/guards/dedupe → session repo → one flow end-to-end → global router → in-flow router → remaining flows.
- Keep changes small, testable, and commit frequently.
- Validate every LLM response with Zod before using.
- Never hardcode API keys or URLs.
