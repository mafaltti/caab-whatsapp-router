# Documentation Improvement Plan

## Context

The project is a WhatsApp assistant router in initial planning phase with `CLAUDE.md` and `PLAN.md` documents. After review, several gaps were identified in architecture decisions, implementation details, deployment strategy, and operational requirements. Through Q&A with the user, all critical decisions have been clarified and documented below.

## Objective

Enhance project documentation to provide complete, unambiguous guidance for implementation. This includes filling architectural gaps, adding missing operational details, creating new supporting documents, and updating existing docs with user-confirmed decisions.

---

## Key Decisions Captured

### Architecture Decisions

| Decision | Choice |
|---|---|
| Framework | Next.js with TypeScript (API routes for webhooks) |
| Deployment | Vercel (serverless functions) |
| Database | Supabase (PostgreSQL) with Supabase CLI migrations |
| LLM Provider | Groq with Llama 3.3 70B versatile (free tier with rotating API keys) |
| Dev Webhooks | ngrok tunnel for local development |
| Testing | Manual testing with real Evolution API instance |

### Implementation Decisions

| Decision | Choice |
|---|---|
| Error Handling | Fail gracefully with generic user-facing error messages, log for review |
| Group Messages | Ignore all group messages completely (`@g.us`) |
| Media Messages | Ignore with optional auto-reply "Por favor, envie uma mensagem de texto" |
| Session Expiry | Clear state completely, treat as new conversation |
| Rate Limiting | Generous limits (10 msg/min, 100 msg/hour per user) |
| Data Validation | LLM-based extraction and validation (leverage Groq's speed) |
| Human Handoff | Not implemented in MVP (phase 2 feature) |

### Flow Requirements

**Digital Certificate Flow (MVP — Priority 1)**

- Subroutes: purchase, renewal, support, requirements, status
- Data to collect: person_type (PF/PJ), CPF/CNPJ, email, phone
- LLM-based extraction with validation

**Billing/Payment Flow (Priority 2)**

- Invoice status check only
- User provides order/invoice ID
- Return payment status (paid/pending/overdue)
- No payment link generation or dispute handling in MVP

---

## Critical Files to Create/Update

**Files to Update:**

- `CLAUDE.md` — Add missing sections with clarified decisions
- `PLAN.md` — Update phases for Next.js/Vercel, correct sequence

**Files to Create:**

- `ENVIRONMENT.md` — Local development setup guide
- `ARCHITECTURE.md` — System architecture with diagrams
- `FLOWS.md` — Detailed flow specifications
- `DEPLOYMENT.md` — Deployment and operations guide

---

## Implementation Plan

### 1. Update CLAUDE.md

Add the following new sections:

#### Section: Error Handling & Resilience

```markdown
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
```

#### Section: Message Type Handling

```markdown
## Message Type Handling

### Non-Text Messages
The bot ONLY processes text messages. Other types are handled as follows:

| Message Type | Action |
|---|---|
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
```

#### Section: Group Messages

```markdown
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
```

#### Section: Rate Limiting

```markdown
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
```

#### Section: Session Expiry

```markdown
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
```

#### Section: Observability

```markdown
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
- `webhook_received`: Every incoming message
- `llm_call`: Every LLM request (prompt type, tokens, latency, confidence)
- `flow_transition`: Flow or step changes
- `message_sent`: Every outbound message
- `error`: Any error (with full stack trace)
- `rate_limit_hit`: When user hits rate limit

### What NOT to Log
- Full message content (PII risk)
- API keys or secrets
- CPF/CNPJ values
- Email addresses in logs

### Monitoring Alerts (Manual Review for MVP)
- Error rate > 5% in 5 minutes
- LLM latency > 5 seconds
- Database query > 2 seconds
```

#### Update: LLM Contracts

```markdown
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

**Input**: User message + recent chat history (last 5 messages)

**Output** (strict JSON):

```json
{
  "flow": "digital_certificate | billing | general_support | unknown",
  "confidence": 0.95,
  "reason": "User mentioned needing a certificate"
}
```

**Validation with Zod**:

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
  "subroute": "purchase | renewal | support | requirements | status | null",
  "confidence": 0.88,
  "reason": "User wants to buy new certificate"
}
```

### Response Format: Data Extraction

```json
{
  "person_type": "PF | PJ | null",
  "cpf_cnpj": "12345678900",
  "email": "user@example.com",
  "phone": "11999999999",
  "confidence": 0.92,
  "missing_fields": ["email"]
}
```

### Confidence Thresholds
- **>= 0.80**: Accept classification/extraction
- **0.60–0.79**: Ask clarifying question
- **< 0.60**: Route to "unknown" or ask open-ended question

### Fallback on Invalid JSON
If LLM returns non-JSON or invalid schema:
1. Log the error with full response
2. Route to "unknown" flow
3. Ask user: "Desculpe, não entendi. Pode reformular sua mensagem?"
```

---

### 2. Update PLAN.md

Revise phase structure for Next.js/Vercel deployment:

#### Updated Phase 0: Project Bootstrap

```markdown
## Phase 0 — Bootstrap Next.js + TypeScript Project

**Goal**: Set up Next.js app with TypeScript, dev environment, and basic structure.

### Setup Steps

1. Create Next.js app:
   ```bash
   npx create-next-app@latest caab-whatsapp-router
   # Choose: TypeScript, App Router, src/ directory
   ```

2. Install dependencies:
   ```bash
   npm install @supabase/supabase-js zod dotenv
   npm install -D @types/node tsx
   ```

3. Install Groq SDK:
   ```bash
   npm install groq-sdk
   ```

4. Setup environment variables:
   - Create `.env.local` with template
   - Add `.env.example` for documentation

5. Create directory structure:
   ```
   src/
     app/
       api/
         health/
           route.ts
         webhook/
           evolution/
             route.ts
     lib/
       db/
       llm/
       flows/
       evolution/
       shared/
   ```

6. Create health check endpoint: `GET /api/health`

### Exit Criteria
- `npm run dev` starts Next.js on http://localhost:3000
- `GET /api/health` returns `{"status": "ok"}`
- TypeScript compiles without errors
```

#### Updated Phase 2: Webhook + Evolution Integration

```markdown
## Phase 2 — Webhook Endpoint + Evolution API Normalization

**Goal**: Receive Evolution webhooks and normalize to internal format.

### Implementation

1. **Create webhook endpoint**: `POST /api/webhook/evolution`

2. **Implement normalization** (`src/lib/webhook/normalize.ts`):

   ```typescript
   interface NormalizedMessage {
     userId: string;           // digits only from sender
     messageId: string;        // data.key.id
     instanceName: string;     // instance
     text: string;             // extracted text
     fromMe: boolean;          // data.key.fromMe
     isGroup: boolean;         // remoteJid check
     timestamp: Date;
   }
   ```

3. **Extraction logic**:
   - Text from: `message.conversation` OR `message.extendedTextMessage.text`
   - Handle quoted messages (extract new text only)
   - Normalize whitespace and trim

4. **Guards**:
   - Ignore if `fromMe === true`
   - Ignore if `remoteJid.endsWith('@g.us')` (groups)
   - Ignore if `remoteJid.endsWith('@lid')` (communities)
   - Ignore if no text content

5. **Setup ngrok for local testing**:
   ```bash
   ngrok http 3000
   # Update Evolution webhook URL to: https://xxx.ngrok.io/api/webhook/evolution
   ```

### Exit Criteria
- Real WhatsApp message triggers webhook successfully
- Normalized payload has correct userId and text
- Group messages and fromMe messages are ignored
```

#### New Phase 4.5: Groq Integration

```markdown
## Phase 4.5 — Groq LLM Integration

**Goal**: Implement LLM client with rotating API keys and strict validation.

### Implementation

1. **Create Groq client** (`src/lib/llm/client.ts`):
   - Key rotation logic
   - Retry on 429 with next key
   - 8-second timeout
   - JSON response parsing

2. **Create schemas** (`src/lib/llm/schemas.ts`):
   - Zod schemas for all LLM responses
   - Validation helpers

3. **Create routers**:
   - `globalRouter.ts`: Top-level flow selection
   - `subrouteRouter.ts`: In-flow subroute selection
   - `extractors.ts`: Data extraction (CPF, email, etc.)

4. **Prompt templates** (`src/lib/llm/prompts.ts`):
   - Use few-shot examples for better classification
   - Include conversation history for context

### Exit Criteria
- Can call Groq API successfully
- Key rotation works on 429 errors
- Invalid JSON responses are caught and handled
- All responses validated with Zod
```

#### Updated Phase 6: Digital Certificate Flow

```markdown
## Phase 6 — Digital Certificate Flow Implementation

**Goal**: Complete end-to-end flow for digital certificate requests.

### Flow Structure

**Flow**: `digital_certificate`

**Subroutes**:
1. `purchase` — Buy new certificate
2. `renewal` — Renew existing certificate
3. `support` — Technical support issues
4. `requirements` — What docs/info needed
5. `status` — Check order status

### Purchase Subroute (Most Complex)

| # | Step | Prompt | Validation | State Update |
|---|---|---|---|---|
| 1 | `ask_person_type` | "Você é pessoa física ou jurídica?" | PF or PJ | `data.person_type` |
| 2 | `ask_cpf_cnpj` | "Por favor, envie seu [CPF/CNPJ]" | 11 digits (CPF) / 14 digits (CNPJ) | `data.cpf_cnpj` |
| 3 | `ask_email` | "Qual seu email para contato?" | Contains @ | `data.email` |
| 4 | `ask_phone` | "Qual seu telefone?" | 10–11 digits | `data.phone` |
| 5 | `confirm` | Summary + "Está correto? (sim/não)" | Yes/No detection | — |
| 6 | `done` | Success message + protocol number | — | Mark complete |

### Other Subroutes (Simplified)
- **renewal**: `ask_order_id` → `ask_email` → `confirm` → `done`
- **support**: `ask_problem` → `collect_description` → `mark_for_human_review`
- **requirements**: `send_info_message` → `done`
- **status**: `ask_order_id` → `lookup_status` → `send_status` → `done`

### Exit Criteria
- User can complete full purchase flow end-to-end
- Data is correctly extracted and validated
- Subroute selection works via LLM
- Session persists across multiple messages
```

---

### 3. Create ENVIRONMENT.md

```markdown
# Development Environment Setup

## Prerequisites
- Node.js 18+ (recommend using nvm)
- npm or pnpm
- Git
- ngrok account (free tier)
- Supabase account (free tier)
- Groq account (free tier with multiple API keys)
- Evolution API instance (test setup)

## Initial Setup

### 1. Clone and Install

```bash
git clone <repo>
cd caab-whatsapp-router
npm install
```

### 2. Environment Variables

Create `.env.local`:

```env
# Server
PORT=3000

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Evolution API
EVOLUTION_BASE_URL=https://your-evolution-api.com
EVOLUTION_API_KEY=your-api-key
EVOLUTION_INSTANCE=your-instance-name

# Groq (comma-separated for rotation)
GROQ_API_KEYS=key1,key2,key3

# Optional
WEBHOOK_SECRET=your-webhook-secret
LOG_LEVEL=debug
NODE_ENV=development
```

### 3. Database Setup

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link to project
supabase link --project-ref your-project-ref

# Run migrations
supabase db push
```

### 4. Start Development Server

```bash
npm run dev
# Server runs on http://localhost:3000
```

### 5. Setup ngrok Tunnel

```bash
# In another terminal
ngrok http 3000

# Copy the HTTPS URL (e.g., https://abc123.ngrok.io)
# Update Evolution API webhook to: https://abc123.ngrok.io/api/webhook/evolution
```

### 6. Test Webhook
Send a WhatsApp message to your Evolution instance number.
Check terminal logs for incoming webhook.

## Development Workflow

### Running Tests

```bash
# Unit tests
npm test

# Watch mode
npm test -- --watch
```

### Database Migrations

```bash
# Create new migration
supabase migration new migration_name

# Apply migrations
supabase db push

# Reset database (CAUTION: deletes all data)
supabase db reset
```

### Viewing Logs
- Development logs output to console in pretty format.
- Use `LOG_LEVEL=debug` for detailed LLM/API logs.

### Debugging
- Use VS Code debugger with Next.js
- Check Supabase dashboard for DB queries
- Check Groq dashboard for API usage
- Check Evolution API logs for webhook delivery

## Common Issues

### Webhook Not Receiving
- Check ngrok is running
- Verify Evolution webhook URL is correct
- Check Evolution API logs
- Verify port 3000 is not blocked

### Database Connection Error
- Verify Supabase URL and key are correct
- Check Supabase project is active
- Verify network connection
- Check Supabase service status

### Groq Rate Limiting
- Verify you have multiple API keys configured
- Check Groq dashboard for rate limits
- Add more API keys if needed
- Consider adding delays between requests

### Evolution API Errors
- Verify Evolution instance is connected
- Check Evolution API key is valid
- Verify instance name matches config
- Check Evolution API documentation for updates
```

---

### 4. Create ARCHITECTURE.md

```markdown
# System Architecture

## Overview

WhatsApp Assistant Router is a serverless webhook-driven application that:
1. Receives messages from Evolution API via webhooks
2. Routes conversations through LLM-powered flow selection
3. Manages stateful multi-turn conversations via Supabase
4. Sends responses back through Evolution API

## System Diagram

```
┌─────────────┐
│  WhatsApp   │
│    User     │
└──────┬──────┘
       │
       ├─ (1) User sends message
       │
       ▼
┌─────────────┐
│ Evolution   │
│   API v2    │
└──────┬──────┘
       │
       ├─ (2) Webhook POST to /api/webhook/evolution
       │
       ▼
┌────────────────────────────────────────┐
│         Next.js (Vercel Serverless)    │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │  Webhook Handler                 │  │
│  │  - Normalize payload             │  │
│  │  - Apply guards (fromMe, groups) │  │
│  │  - Deduplicate by message_id     │  │
│  └─────────────┬────────────────────┘  │
│                │                        │
│                ▼                        │
│  ┌──────────────────────────────────┐  │
│  │  Load Session from Supabase      │  │
│  │  - Check TTL / expiry            │  │
│  │  - Load conversation state       │  │
│  └─────────────┬────────────────────┘  │
│                │                        │
│                ▼                        │
│  ┌──────────────────────────────────┐  │
│  │  Routing Engine                  │  │
│  │  ┌────────────────────────────┐  │  │
│  │  │ Topic Shift Detection?     │  │  │
│  │  │ (rule-based + LLM)         │  │  │
│  │  └────────────┬───────────────┘  │  │
│  │               │                  │  │
│  │               ├─ New session     │  │
│  │               │  → Global Router │  │
│  │               │                  │  │
│  │               └─ Existing flow   │  │
│  │                  → Continue      │  │
│  └─────────────┬────────────────────┘  │
│                │                        │
│                ▼                        │
│  ┌──────────────────────────────────┐  │
│  │  Flow Handler                    │  │
│  │  - Subroute selection (if needed)│  │
│  │  - Step execution                │  │
│  │  - Data extraction/validation    │  │
│  │  - State transition              │  │
│  └─────────────┬────────────────────┘  │
│                │                        │
│                ▼                        │
│  ┌──────────────────────────────────┐  │
│  │  Save State to Supabase          │  │
│  │  - Upsert conversation_state     │  │
│  │  - Insert chat_messages          │  │
│  │  - Update TTL (expires_at)       │  │
│  └─────────────┬────────────────────┘  │
│                │                        │
│                ▼                        │
│  ┌──────────────────────────────────┐  │
│  │  Send Reply via Evolution API    │  │
│  │  - POST /message/sendText        │  │
│  └──────────────────────────────────┘  │
└────────────────────────────────────────┘
       │
       ├─ (3) Evolution sends message to WhatsApp
       │
       ▼
┌─────────────┐
│  WhatsApp   │
│    User     │
└─────────────┘

External Services:
┌──────────┐  ┌───────────┐  ┌──────────┐
│ Supabase │  │   Groq    │  │Evolution │
│(Postgres)│  │ (Llama 3) │  │ API v2   │
└──────────┘  └───────────┘  └──────────┘
```

## Component Breakdown

### 1. Webhook Handler (`/api/webhook/evolution`)

**Responsibilities**:
- Receive Evolution API webhooks (`messages.upsert` events)
- Normalize payload to internal format
- Apply guards (fromMe, groups, media types)
- Deduplicate by message_id

**Key Files**:
- `src/app/api/webhook/evolution/route.ts`
- `src/lib/webhook/normalize.ts`

### 2. Session Manager

**Responsibilities**:
- Load conversation state from Supabase
- Check session expiry (30-min TTL)
- Upsert state after processing
- Manage session lifecycle

**Key Files**:
- `src/lib/db/sessionRepo.ts`

### 3. Router System

**3a. Global Router**
- Determines top-level flow for new sessions
- Handles topic shifts mid-conversation
- Uses Groq LLM for classification

**3b. Subroute Router**
- Within a flow, determines subroute
- Flow-specific logic (e.g., purchase vs support)
- Also uses LLM with flow-specific prompts

**Key Files**:
- `src/lib/llm/globalRouter.ts`
- `src/lib/llm/subrouteRouter.ts`

### 4. Flow Engine

**Responsibilities**:
- Execute step-by-step conversation logic
- Validate user inputs
- Extract data using LLM
- Transition between steps
- Mark flows as complete

**Flow Structure**:
```
Flow
├── Subroute A
│    ├── Step 1
│    ├── Step 2
│    └── Step 3
└── Subroute B
     ├── Step 1
     └── Step 2
```

**Key Files**:
- `src/lib/flows/digitalCertificate/flow.ts`
- `src/lib/flows/billing/flow.ts`

### 5. Evolution Client

**Responsibilities**:
- Send text messages via Evolution API
- Handle API errors (retry policy)
- Log all outbound messages

**Key Files**:
- `src/lib/evolution/client.ts`

### 6. Groq LLM Client

**Responsibilities**:
- Call Groq API with rotating keys
- Parse and validate JSON responses
- Handle rate limiting (429 errors)
- Timeout management

**Key Files**:
- `src/lib/llm/client.ts`
- `src/lib/llm/schemas.ts`

## Data Flow

### Conversation State Lifecycle

```
User sends first message
  → No session exists
  → Create session with flow="unknown", step="start"
  → Run global router
  → Update session with detected flow
  → Execute first step
  → Save session with TTL=now+30min

User continues conversation
  → Load session
  → Check if expired (now > expires_at)
  → If expired: treat as new session (step 1)
  → If active: continue current flow
  → Execute current step
  → Update session, reset TTL

User completes flow
  → Mark session as done
  → Option: delete session or keep for history
```

### LLM Decision Points

**When IS the LLM called?**
1. **New session** → Global Router (flow selection)
2. **Topic shift check** → Topic Shift Classifier (optional)
3. **Subroute selection** → Subroute Router (if flow requires)
4. **Data extraction** → Extractor (for CPF, email, etc.)

**When is the LLM NOT called?**
- Simple validation (yes/no, numeric inputs)
- Known patterns (keyword matching)
- State transitions (deterministic step logic)

## Database Schema

### `conversation_state`

```sql
CREATE TABLE conversation_state (
  user_id TEXT PRIMARY KEY,
  instance TEXT NOT NULL,
  active_flow TEXT,
  active_subroute TEXT,
  step TEXT NOT NULL,
  data JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '30 minutes')
);

CREATE INDEX idx_conv_expires ON conversation_state(expires_at);
```

### `chat_messages`

```sql
CREATE TABLE chat_messages (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  instance TEXT NOT NULL,
  direction TEXT NOT NULL,          -- 'in' or 'out'
  message_id TEXT UNIQUE,           -- Evolution message ID (null for outbound)
  text TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_msg_id ON chat_messages(message_id) WHERE message_id IS NOT NULL;
CREATE INDEX idx_chat_user_time ON chat_messages(user_id, created_at DESC);
```

## Deployment Architecture

### Vercel Serverless

| Setting | Value |
|---|---|
| Region | Auto (closest to users) |
| Runtime | Node.js 18+ |
| Timeout | 30 seconds max (use 25s internal limit) |
| Memory | 1024MB (default) |
| Concurrency | Auto-scaling |

### Environment Variables (Vercel Dashboard)

All sensitive values stored in Vercel project settings:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `EVOLUTION_BASE_URL`
- `EVOLUTION_API_KEY`
- `GROQ_API_KEYS` (comma-separated)
- `WEBHOOK_SECRET` (optional)

### CI/CD
- **Git Integration**: GitHub → Vercel
- **Auto-deploy**: Push to `main` triggers production deploy
- **Preview**: PRs get preview URLs automatically
- **Rollback**: One-click rollback in Vercel dashboard

## Security Considerations

### Secrets Management
- All secrets in environment variables
- No secrets in code or git
- Rotate Evolution API key periodically
- Rotate Groq API keys if compromised

### Webhook Security
- Optional `WEBHOOK_SECRET` header validation
- Verify request origin (Evolution API IP if static)
- Rate limiting per user

### Data Privacy
- No PII in logs (mask CPF/email)
- Encrypt sensitive data in database (TDE enabled on Supabase)
- Session data expires automatically (TTL)
- GDPR compliance: user can request data deletion

### Input Validation
- Validate all LLM outputs with Zod
- Sanitize user inputs before DB storage
- Prevent injection attacks (SQL, command, XSS)

## Performance Characteristics

### Expected Latencies

| Operation | Latency |
|---|---|
| Webhook → Response (p50) | 2–5 seconds |
| Database query | 50–200ms |
| Groq LLM call | 500–1500ms |
| Evolution sendText | 200–500ms |

### Bottlenecks
- LLM calls are slowest (mitigated by Groq's speed)
- Database connection pooling critical in serverless
- Evolution API rate limits (check their docs)

### Scaling
- **Horizontal**: Vercel auto-scales functions
- **Database**: Supabase connection pooler handles serverless
- **LLM**: Groq's free tier per-key limits (use more keys)

## Monitoring & Alerts

### Key Metrics to Track
- Webhook processing time (p50, p95, p99)
- LLM call latency and confidence scores
- Error rate (overall and per component)
- Database query performance
- Evolution API success rate

### Logs
- Structured JSON logs to stdout
- Vercel automatically captures and displays
- Can integrate with external log services (Datadog, LogDNA)

### Alerts (Manual for MVP)
- Check Vercel dashboard daily
- Review error logs in Vercel
- Monitor Groq usage in Groq dashboard
- Check Supabase metrics for slow queries
```

---

### 5. Create FLOWS.md

```markdown
# Flow Specifications

## Overview

This document specifies the exact behavior of each conversation flow, including subroutes, steps, data collection, and validation rules.

---

## Flow 1: Digital Certificate

**Flow ID**: `digital_certificate`

**Description**: Handles all digital certificate requests including purchase, renewal, support, requirements info, and status checks.

**Entry Triggers**:
- Keywords: "certificado", "certificado digital", "e-CPF", "e-CNPJ", "assinatura digital"
- LLM classification with confidence >= 0.80

### Subroutes

#### 1.1 Purchase (`purchase`)

Complete flow for buying a new digital certificate.

##### Step: `ask_person_type`
- **Question**: "Você é pessoa física (PF) ou pessoa jurídica (PJ)?"
- **Expected Input**: "PF", "PJ", "física", "jurídica", or similar
- **Validation**: Use LLM extraction to normalize to "PF" or "PJ". If unclear, ask again (max 2 retries).
- **State Update**: `data.person_type = "PF" | "PJ"`
- **Next Step**: `ask_cpf_cnpj`

##### Step: `ask_cpf_cnpj`
- **Question**:
  - If PF: "Por favor, envie seu CPF (somente números)"
  - If PJ: "Por favor, envie seu CNPJ (somente números)"
- **Expected Input**: 11 digits (CPF) or 14 digits (CNPJ)
- **Validation**:
  - Use LLM to extract numbers from free-form text
  - Validate format: CPF = 11 digits, CNPJ = 14 digits
  - Check basic validation (not all same digit, not sequential)
  - Max 3 retries, then ask "Você prefere continuar com um atendente humano?"
- **State Update**: `data.cpf_cnpj = "12345678900"`
- **Next Step**: `ask_email`

##### Step: `ask_email`
- **Question**: "Qual é seu melhor email para contato?"
- **Expected Input**: Email address
- **Validation**:
  - Use LLM extraction (handles "meu email é..." etc.)
  - Validate contains `@` and domain
  - No strict regex (accept varied formats)
- **State Update**: `data.email = "user@example.com"`
- **Next Step**: `ask_phone`

##### Step: `ask_phone`
- **Question**: "Qual é seu telefone com DDD? (Ex: 11999999999)"
- **Expected Input**: 10–11 digit phone number
- **Validation**:
  - Use LLM extraction
  - Validate 10–11 digits
  - Accept with or without formatting
- **State Update**: `data.phone = "11999999999"`
- **Next Step**: `confirm`

##### Step: `confirm`
- **Question**:
  ```
  Confirme seus dados:
  • Tipo: [PF/PJ]
  • CPF/CNPJ: [***.***.**_-__]
  • Email: [email]
  • Telefone: [(11) 99999-9999]

  Está tudo correto? (sim/não)
  ```
- **Expected Input**: "sim", "não", or similar
- **Validation**: Simple yes/no detection
- **Actions**:
  - If "sim": Mark flow as complete → send success message → clear session or mark for manual follow-up
  - If "não": Ask "Qual dado está incorreto? (1-CPF, 2-Email, 3-Telefone)" → route back to corresponding step
- **Next Step**: `done` or back to specific field

##### Step: `done`
- **Message**:
  ```
  Perfeito! Recebemos sua solicitação de certificado digital.

  Nosso time entrará em contato no email [email] ou telefone [phone] em até 24 horas úteis.

  Número do protocolo: [generate unique ID]

  Posso ajudar com mais alguma coisa?
  ```
- **State Update**: Mark session as complete
- **Session**: Optionally delete or mark as closed

---

#### 1.2 Renewal (`renewal`)

For renewing existing digital certificates.

##### Step: `ask_order_id`
- **Question**: "Para renovar seu certificado, preciso do número do pedido anterior. Você tem o número?"
- **Expected**: Order/protocol number or "não sei"
- **Validation**: If has order ID → extract and validate format. If "não sei" → ask for CPF/CNPJ instead.
- **Next Step**: `ask_email_renewal` or `ask_cpf_cnpj_renewal`

##### Step: `ask_cpf_cnpj_renewal` (if no order ID)
- Same as purchase flow
- **Next Step**: `ask_email_renewal`

##### Step: `ask_email_renewal`
- Same as purchase `ask_email`
- **Next Step**: `confirm_renewal`

##### Step: `confirm_renewal`
- **Message**:
  ```
  Renovação solicitada!
  • Pedido anterior: [order_id or CPF]
  • Email: [email]

  Correto? (sim/não)
  ```
- **Next Step**: `done_renewal`

##### Step: `done_renewal`
- **Message**: "Renovação registrada! Você receberá instruções em [email] em até 24h."

---

#### 1.3 Support (`support`)

Technical support for certificate issues.

##### Step: `ask_problem`
- **Question**: "Qual problema você está enfrentando com seu certificado digital?"
- **Expected**: Free-form text description
- **Validation**: None (accept any text)
- **State Update**: `data.problem_description`
- **Next Step**: `ask_order_id_support`

##### Step: `ask_order_id_support`
- **Question**: "Você tem o número do pedido ou protocolo do certificado?"
- **Expected**: Order ID or "não"
- **Validation**: Optional field
- **Next Step**: `confirm_support`

##### Step: `confirm_support`
- **Message**:
  ```
  Registramos seu chamado de suporte:
  • Problema: [brief summary from LLM]
  • Pedido: [order_id or "não informado"]

  Está correto? (sim/não)
  ```
- **Next Step**: `done_support`

##### Step: `done_support`
- **Message**:
  ```
  Chamado aberto com sucesso!
  Protocolo: [ID]

  Nosso suporte técnico entrará em contato em até 12 horas.
  ```

---

#### 1.4 Requirements (`requirements`)

Information about what's needed for a certificate.

##### Step: `show_requirements`
- **Message**:
  ```
  Para emitir um certificado digital, você precisará de:

  📋 Pessoa Física (e-CPF):
  • CPF
  • RG (frente e verso)
  • Comprovante de residência
  • Selfie com documento

  🏢 Pessoa Jurídica (e-CNPJ):
  • CNPJ
  • Contrato social
  • RG e CPF do responsável legal
  • Comprovante de endereço da empresa

  Quer iniciar o processo? (sim/não)
  ```
- **Next Step**: If "sim" → redirect to `purchase` subroute. If "não" → `done_requirements`.

##### Step: `done_requirements`
- **Message**: "Ok! Se precisar, é só me chamar. Posso ajudar com mais algo?"

---

#### 1.5 Status (`status`)

Check status of existing order.

##### Step: `ask_order_id_status`
- **Question**: "Qual o número do seu pedido ou protocolo?"
- **Expected**: Order ID
- **Validation**: Extract alphanumeric ID
- **Next Step**: `lookup_status`

##### Step: `lookup_status`
- **Action**: Query database/system for order status (mock for MVP)
- **Message**:
  ```
  Status do pedido [ID]:
  • Status: [Em processamento / Aguardando documentos / Concluído]
  • Última atualização: [date]
  • [Additional details if available]
  ```
- **Next Step**: `done_status`

##### Step: `done_status`
- **Message**: "Mais alguma dúvida sobre seu pedido?"

---

## Flow 2: Billing/Payment

**Flow ID**: `billing`

**Description**: Invoice and payment status inquiries.

**Entry Triggers**:
- Keywords: "boleto", "pagamento", "fatura", "cobrança", "pagar"
- LLM classification

### Subroutes

#### 2.1 Invoice Status (`status`)

Default and only subroute for MVP.

##### Step: `ask_invoice_id`
- **Question**: "Para consultar sua fatura, preciso do número da nota fiscal ou do pedido. Pode me enviar?"
- **Expected**: Invoice/order number
- **Validation**: Extract alphanumeric ID
- **Next Step**: `lookup_invoice`

##### Step: `lookup_invoice`
- **Action**: Query billing system (mock for MVP)
- **Message**:
  ```
  Fatura #[ID]:
  • Status: [Pago / Pendente / Vencido]
  • Valor: R$ [amount]
  • Vencimento: [due_date]
  • [If pending/overdue: include payment instructions]
  ```
- **Next Step**: `done_billing`

##### Step: `done_billing`
- **Message**: "Posso ajudar com mais alguma coisa relacionada a pagamentos?"

---

## Flow 3: General Support

**Flow ID**: `general_support`

**Description**: Catch-all for questions that don't fit other flows.

**No subroutes** — single linear flow.

##### Step: `ask_details`
- **Question**: "Como posso ajudar você?"
- **Expected**: Free-form question
- **Next Step**: `provide_answer`

##### Step: `provide_answer`
- **Action**: For MVP → generic response + offer human handoff. Future → use LLM to generate helpful response or route to knowledge base.
- **Message**:
  ```
  Entendo que você precisa de ajuda com [topic summary].

  Para melhor atendê-lo, posso transferir para um atendente humano. Deseja?
  (sim/não)
  ```
- **Next Step**: `done_support` or mark for human handoff

##### Step: `done_support`
- **Message**: "Obrigado! Se precisar de mais ajuda, é só me chamar."

---

## Flow 4: Unknown

**Flow ID**: `unknown`

**Description**: When LLM cannot classify intent with confidence.

##### Step: `clarify_intent`
- **Question**:
  ```
  Olá! Sou o assistente virtual da [Company].

  Posso ajudar com:
  1️⃣ Certificado Digital
  2️⃣ Pagamentos e faturas
  3️⃣ Suporte geral

  Escolha uma opção ou descreva como posso ajudar.
  ```
- **Next Step**: Run global router again with user's response

---

## Validation & Error Handling

### Retry Logic
- **Max retries per step**: 3
- **On max retries exceeded**: Offer human handoff or route to `general_support`

### Invalid Input Handling
```
User: [invalid input]
Bot: "Não entendi. Pode reformular? Por exemplo: [example]"
[Retry counter++]
```

### LLM Extraction Failures
- If LLM returns low confidence (< 0.80): ask again with example
- If LLM returns invalid JSON: fallback to pattern matching
- If repeated failures: route to human handoff

---

## Flow Transition Rules

### Topic Shift Detection

Run topic shift classifier if:
- User message contains strong keywords for different flow
- LLM confidence for topic shift >= 0.80

**Example**:
```
Current: digital_certificate > purchase > ask_email
User: "Quanto custa o certificado?" (billing question)
→ Topic shift detected
→ Switch to billing flow
→ Clear previous flow state
```

### Explicit Commands

User can reset conversation:
- Keywords: "reiniciar", "começar de novo", "cancelar"
- Action: Clear session, restart as new conversation

---

## Response Templates

### Greeting (First Message)
```
Olá! Sou o assistente virtual da [Company]. 😊

Posso ajudar com:
• Certificados Digitais
• Consultas de pagamento
• Suporte técnico

Como posso ajudar você hoje?
```

### Error Message (Generic)
```
Desculpe, estou com dificuldades técnicas no momento.
Por favor, tente novamente em alguns minutos ou entre em contato pelo [support_channel].
```

### Session Expired (Implicit)
```
[No special message - just respond naturally to new message as if new session]
```

### Rate Limit Exceeded
```
Você está enviando mensagens muito rapidamente.
Por favor, aguarde um momento antes de continuar.
```

### Media Message Received
```
Por favor, envie sua mensagem em formato de texto.
No momento não consigo processar imagens, áudios ou documentos.
```
```

---

## Verification Plan

After implementing the improved documentation:

### Completeness Check
- All architectural decisions documented
- All flows fully specified
- All environment variables listed
- All error scenarios covered

### Consistency Check
- `CLAUDE.md` and `PLAN.md` are aligned
- Flow specs match data model
- Environment variables consistent across docs

### Clarity Check
- No ambiguous instructions
- All examples are complete
- Technical terms defined
- Next steps clear for implementation

### Review with User
- Present improved docs
- Confirm all decisions captured correctly
- Identify any remaining gaps

---

## Summary

This plan will create comprehensive documentation that:

- Fills all identified gaps in `CLAUDE.md` and `PLAN.md`
- Incorporates all user-confirmed architectural decisions
- Provides complete flow specifications with step-by-step details
- Includes environment setup for local development
- Documents system architecture with diagrams
- Adds deployment and operational guidance

### Critical Files to Create/Update

| File | Action | Description |
|---|---|---|
| `CLAUDE.md` | Update | ~7 new sections |
| `PLAN.md` | Revise | Phases for Next.js/Vercel |
| `ENVIRONMENT.md` | Create | Dev setup guide |
| `ARCHITECTURE.md` | Create | System design |
| `FLOWS.md` | Create | Complete flow specifications |

**Ready for implementation**: Yes — all questions answered, all decisions documented.
