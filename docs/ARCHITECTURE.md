# System Architecture

## Overview
WhatsApp Assistant Router is a **serverless**, **webhook-driven** application that:
1. Receives messages from Evolution API via webhooks
2. Routes conversations through LLM-powered flow selection
3. Manages stateful multi-turn conversations via Supabase
4. Sends responses back through Evolution API

**Key Characteristics**:
- **Serverless**: Deployed on Vercel, auto-scales, no server management
- **Stateless**: All state persisted in Supabase (database)
- **Event-driven**: Triggered by Evolution API webhooks
- **LLM-assisted**: Uses Groq (Llama 3.3 70B) for intent classification and data extraction

---

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
┌────────────────────────────────────────────────┐
│         Next.js API Route (Vercel Serverless)  │
│  ┌──────────────────────────────────────────┐  │
│  │  Webhook Handler                         │  │
│  │  - Validate & normalize payload          │  │
│  │  - Apply guards (fromMe, groups, media)  │  │
│  │  - Deduplicate by message_id             │  │
│  └─────────────┬────────────────────────────┘  │
│                │                                │
│                ▼                                │
│  ┌──────────────────────────────────────────┐  │
│  │  Load Session from Supabase              │  │
│  │  - Check TTL / expiry (30 min)           │  │
│  │  - Load conversation_state               │  │
│  │  - Load recent chat_messages (optional)  │  │
│  └─────────────┬────────────────────────────┘  │
│                │                                │
│                ▼                                │
│  ┌──────────────────────────────────────────┐  │
│  │  Routing Engine                          │  │
│  │  ┌────────────────────────────────────┐  │  │
│  │  │ Session Expired or New User?       │  │  │
│  │  │  → Global Router (LLM)             │  │  │
│  │  └──────────┬─────────────────────────┘  │  │
│  │             │                             │  │
│  │             ├─ Existing Active Session    │  │
│  │             │  → Topic Shift Check        │  │
│  │             │  → Continue Current Flow    │  │
│  │             │                             │  │
│  │  ┌──────────▼─────────────────────────┐  │  │
│  │  │ Flow Needs Subroute?               │  │  │
│  │  │  → Subroute Router (LLM)           │  │  │
│  │  └────────────────────────────────────┘  │  │
│  └─────────────┬────────────────────────────┘  │
│                │                                │
│                ▼                                │
│  ┌──────────────────────────────────────────┐  │
│  │  Flow Handler                            │  │
│  │  - Execute current step logic            │  │
│  │  - Validate user input                   │  │
│  │  - Extract data using LLM (if needed)    │  │
│  │  - Determine next step                   │  │
│  │  - Generate reply message                │  │
│  └─────────────┬────────────────────────────┘  │
│                │                                │
│                ▼                                │
│  ┌──────────────────────────────────────────┐  │
│  │  Save State to Supabase                  │  │
│  │  - Upsert conversation_state             │  │
│  │  - Insert inbound message (dedupe check) │  │
│  │  - Update TTL (expires_at)               │  │
│  └─────────────┬────────────────────────────┘  │
│                │                                │
│                ▼                                │
│  ┌──────────────────────────────────────────┐  │
│  │  Send Reply via Evolution API            │  │
│  │  - POST /message/sendText                │  │
│  │  - 5s timeout (fail fast)                │  │
│  └─────────────┬────────────────────────────┘  │
│                │                                │
│                ▼                                │
│  ┌──────────────────────────────────────────┐  │
│  │  Save Outbound Message                   │  │
│  │  - Insert to chat_messages               │  │
│  │  - direction='out', message_id=null      │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  Return 200 OK (< 25 seconds total)            │
└─────────────────────────────────────────────────┘
       │
       ├─ (3) Evolution sends message to WhatsApp
       │
       ▼
┌─────────────┐
│  WhatsApp   │
│    User     │
└─────────────┘

External Services:
┌────────────┐  ┌─────────────┐  ┌──────────────┐
│  Supabase  │  │    Groq     │  │  Evolution   │
│ (Postgres) │  │ (Llama 3.3) │  │   API v2     │
└────────────┘  └─────────────┘  └──────────────┘
```

---

## Component Breakdown

### 1. Webhook Handler (`/api/webhook/evolution`)

**File**: `src/app/api/webhook/evolution/route.ts`

**Responsibilities**:
- Receive Evolution API webhooks (`messages.upsert` events)
- Normalize payload to internal format
- Apply guards (fromMe, groups, media types)
- Deduplicate by message_id
- Return 200 OK quickly (< 25s for Vercel)

**Key Logic**:
```typescript
export async function POST(request: Request) {
  // 1. Parse webhook payload
  const payload = await request.json();

  // 2. Normalize to internal format
  const normalized = normalizeEvolutionPayload(payload);

  // 3. Apply guards
  if (normalized.fromMe) return Response.json({ ok: true });
  if (normalized.isGroup) return Response.json({ ok: true });
  if (!normalized.text) {
    await sendMediaAutoReply(normalized.userId);
    return Response.json({ ok: true });
  }

  // 4. Process message
  await processMessage(normalized);

  return Response.json({ ok: true });
}
```

**Guards (applied in order)**:
1. `fromMe === true` → ignore completely
2. `remoteJid.endsWith('@g.us')` or `@lid` → ignore (groups/communities)
3. No text content (image/audio/video) → send auto-reply, ignore
4. Message already processed (duplicate `message_id`) → ignore

---

### 2. Session Manager

**File**: `src/lib/db/sessionRepo.ts`

**Responsibilities**:
- Load conversation state from Supabase
- Check session expiry (30-min TTL)
- Upsert state after processing
- Clear/delete expired sessions

**Key Functions**:
```typescript
async function getSession(userId: string): Promise<SessionState | null> {
  // Load from conversation_state table
  // Check if now > expires_at (expired)
  // Return null if expired or not found
}

async function upsertSession(session: SessionState): Promise<void> {
  // Update conversation_state with new state
  // Set expires_at = now + 30 minutes
}

async function clearSession(userId: string): Promise<void> {
  // Delete conversation_state record
  // Keep chat_messages for audit
}
```

**Session State Structure**:
```typescript
interface SessionState {
  userId: string;
  instance: string;
  active_flow: string | null;
  active_subroute: string | null;
  step: string;
  data: Record<string, any>;  // Collected data (CPF, email, etc.)
  updated_at: Date;
  expires_at: Date;
}
```

---

### 3. Router System

#### 3a. Global Router

**File**: `src/lib/llm/globalRouter.ts`

**Purpose**: Determines top-level flow for new sessions or topic shifts

**When Called**:
- New user (no session exists)
- Session expired
- Topic shift detected mid-conversation (optional)

**LLM Input**:
```
System: You are a conversation router. Classify the user's intent into one of these flows:
- digital_certificate: User needs help with digital certificates
- billing: User has questions about invoices or payments
- general_support: General questions or issues
- unknown: Cannot determine intent

User message: "Preciso renovar meu certificado digital"
Recent history: [last 5 messages]

Respond ONLY with valid JSON: {"flow": "...", "confidence": 0.0-1.0, "reason": "..."}
```

**Output** (validated with Zod):
```json
{
  "flow": "digital_certificate",
  "confidence": 0.95,
  "reason": "User mentioned renewing digital certificate"
}
```

**Confidence Thresholds**:
- `>= 0.80`: Accept classification, route to flow
- `0.60 - 0.79`: Ask clarifying question
- `< 0.60`: Route to "unknown" flow, show menu

---

#### 3b. Subroute Router

**File**: `src/lib/llm/subrouteRouter.ts`

**Purpose**: Within a flow, determines which subroute to enter

**When Called**:
- User enters a flow for the first time
- `active_subroute` is null
- User message is ambiguous within current flow

**Example for Digital Certificate Flow**:

**LLM Input**:
```
System: User is in the digital_certificate flow. Classify their intent into subroutes:
- purchase: Buy a new digital certificate
- renewal: Renew existing certificate
- support: Technical issues or problems
- requirements: Ask what documents/info are needed
- status: Check order status

User message: "Quero comprar um certificado novo"

Respond ONLY with valid JSON: {"subroute": "...", "confidence": 0.0-1.0, "reason": "..."}
```

**Output**:
```json
{
  "subroute": "purchase",
  "confidence": 0.92,
  "reason": "User explicitly wants to buy new certificate"
}
```

---

#### 3c. Data Extractors

**File**: `src/lib/llm/extractors.ts`

**Purpose**: Extract structured data from free-form user input

**Functions**:
- `extractPersonType(text)` → "PF" | "PJ"
- `extractCpfCnpj(text)` → digits only
- `extractEmail(text)` → email address
- `extractPhone(text)` → digits only

**Example**:

**User Input**: "Meu email é joao.silva@example.com e meu CPF é 123.456.789-00"

**LLM Prompt**:
```
Extract the following information from the user's message:
- email (valid email address)
- cpf_cnpj (digits only, 11 for CPF or 14 for CNPJ)
- phone (10-11 digits)

User message: "Meu email é joao.silva@example.com e meu CPF é 123.456.789-00"

Respond ONLY with valid JSON.
```

**LLM Output** (validated):
```json
{
  "email": "joao.silva@example.com",
  "cpf_cnpj": "12345678900",
  "phone": null,
  "confidence": 0.95,
  "missing_fields": ["phone"]
}
```

---

### 4. Flow Engine

**Files**: `src/lib/flows/*`

**Responsibilities**:
- Execute step-by-step conversation logic
- Validate user inputs
- Call LLM extractors when needed
- Transition between steps
- Mark flows as complete

**Flow Structure**:
```
Flow (e.g., digital_certificate)
 ├── Subroute: purchase
 │    ├── Step: ask_person_type
 │    ├── Step: ask_cpf_cnpj
 │    ├── Step: ask_email
 │    ├── Step: ask_phone
 │    ├── Step: confirm
 │    └── Step: done
 ├── Subroute: renewal
 │    └── Steps...
 └── Subroute: support
      └── Steps...
```

**Step Handler Interface**:
```typescript
interface StepHandler {
  (state: SessionState, userMessage: string): Promise<StepResult>;
}

interface StepResult {
  reply: string;          // Message to send to user
  nextStep: string;       // Next step name
  updatedData: Record<string, any>;  // Updated session data
  done: boolean;          // Flow complete?
}
```

**Example Step Implementation**:
```typescript
async function askCpfCnpj(state: SessionState, userMessage: string): Promise<StepResult> {
  const personType = state.data.person_type;

  // Extract CPF/CNPJ using LLM
  const extracted = await extractCpfCnpj(userMessage);

  // Validate
  const isValid = personType === 'PF'
    ? extracted.length === 11
    : extracted.length === 14;

  if (!isValid) {
    return {
      reply: `Por favor, envie um ${personType === 'PF' ? 'CPF' : 'CNPJ'} válido.`,
      nextStep: 'ask_cpf_cnpj',  // Retry same step
      updatedData: state.data,
      done: false
    };
  }

  return {
    reply: 'Ótimo! Agora, qual é seu melhor email para contato?',
    nextStep: 'ask_email',
    updatedData: { ...state.data, cpf_cnpj: extracted },
    done: false
  };
}
```

---

### 5. Evolution Client

**File**: `src/lib/evolution/client.ts`

**Responsibilities**:
- Send text messages via Evolution API
- Handle API errors (no retries in serverless)
- Log all outbound messages

**Key Function**:
```typescript
async function sendText(instance: string, number: string, text: string): Promise<boolean> {
  try {
    const response = await fetch(`${EVOLUTION_BASE_URL}/message/sendText`, {
      method: 'POST',
      headers: {
        'apikey': EVOLUTION_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        number,
        text
      }),
      signal: AbortSignal.timeout(5000)  // 5s timeout
    });

    if (!response.ok) {
      logger.error('Failed to send message', { status: response.status });
      return false;
    }

    return true;
  } catch (error) {
    logger.error('Evolution API error', { error });
    return false;
  }
}
```

**Error Handling**:
- **Timeout (5s)**: Log error, return false
- **HTTP 4xx**: Log error, return false (don't retry)
- **HTTP 5xx**: Log error, return false (don't retry in serverless)
- **Network error**: Log error, return false

If send fails, user gets generic error message on next interaction.

---

### 6. Groq LLM Client

**File**: `src/lib/llm/client.ts`

**Responsibilities**:
- Call Groq API with rotating keys
- Parse and validate JSON responses
- Handle rate limiting (429 errors)
- Timeout management (8s)

**Key Rotation Logic**:
```typescript
const GROQ_API_KEYS = process.env.GROQ_API_KEYS!.split(',');
let currentKeyIndex = 0;

function getNextApiKey(): string {
  const key = GROQ_API_KEYS[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % GROQ_API_KEYS.length;
  return key;
}

async function callGroq(prompt: string): Promise<any> {
  let lastError: Error | null = null;

  // Try all keys once
  for (let i = 0; i < GROQ_API_KEYS.length; i++) {
    const apiKey = getNextApiKey();

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0,
          max_tokens: 500
        }),
        signal: AbortSignal.timeout(8000)
      });

      if (response.status === 429) {
        // Rate limited, try next key
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      return JSON.parse(data.choices[0].message.content);
    } catch (error) {
      lastError = error;
      continue;
    }
  }

  // All keys failed
  throw lastError || new Error('All Groq API keys exhausted');
}
```

**Response Validation**:
```typescript
async function globalRouter(message: string, history: Message[]): Promise<FlowSelection> {
  const prompt = buildGlobalRouterPrompt(message, history);
  const rawResponse = await callGroq(prompt);

  // Validate with Zod
  const result = GlobalRouterSchema.safeParse(rawResponse);

  if (!result.success) {
    logger.error('Invalid LLM response', { response: rawResponse, error: result.error });
    // Fallback: return unknown flow
    return { flow: 'unknown', confidence: 0, reason: 'Invalid LLM response' };
  }

  return result.data;
}
```

---

## Data Flow

### Conversation State Lifecycle

#### 1. New User (First Message)
```
User sends: "Oi"
  ↓
No session exists in database
  ↓
Create session: { flow: null, step: "start", data: {} }
  ↓
Call Global Router LLM
  ↓
LLM returns: { flow: "unknown", confidence: 0.4 }
  ↓
Route to "unknown" flow → show menu
  ↓
Send reply: "Olá! Como posso ajudar? 1) Certificados 2) Pagamentos..."
  ↓
Save session: { flow: "unknown", step: "clarify_intent", expires_at: now+30min }
```

#### 2. User Continues (Within TTL)
```
User sends: "Preciso de certificado digital"
  ↓
Load session from database
  ↓
Check: now < expires_at? → YES (active session)
  ↓
Call Global Router (or Topic Shift Detector)
  ↓
LLM returns: { flow: "digital_certificate", confidence: 0.95 }
  ↓
Switch flow, reset subroute/step
  ↓
Call Subroute Router
  ↓
LLM returns: { subroute: null, confidence: 0.3 }  (ambiguous)
  ↓
Send reply: "Você quer comprar, renovar ou precisa de suporte?"
  ↓
Save session: { flow: "digital_certificate", subroute: null, step: "ask_subroute" }
```

#### 3. User Completes Flow
```
User completes all steps successfully
  ↓
Final step sets: { done: true }
  ↓
Send success message with protocol number
  ↓
Option A: Delete session completely
Option B: Mark session as complete, keep for history
```

#### 4. Session Expires
```
User sends message after 30+ minutes
  ↓
Load session from database
  ↓
Check: now > expires_at? → YES (expired)
  ↓
Treat as new user (step 1)
  ↓
No mention of "your session expired" to user
```

---

### LLM Decision Points

**When is LLM called?**
| Scenario | LLM Function | Purpose |
|----------|--------------|---------|
| New user, no session | Global Router | Determine top-level flow |
| Session expired | Global Router | Re-determine flow |
| Topic shift detected | Topic Shift Classifier | Confirm flow change |
| Need subroute | Subroute Router | Select subroute within flow |
| Extract CPF/email/phone | Data Extractor | Parse free-form input |

**When is LLM NOT called?**
| Scenario | Why Not? |
|----------|----------|
| Simple yes/no validation | Pattern matching sufficient |
| Known keywords ("reiniciar", "cancelar") | Rule-based detection |
| State transitions | Deterministic step logic |
| Media message received | Guard already applied |
| Message from self (fromMe) | Guard already applied |

---

## Database Schema

Migrations stored in `supabase/migrations/` (managed via Supabase CLI).
TypeScript types auto-generated with `supabase gen types typescript --local > src/lib/db/types.ts`.

### conversation_state
```sql
CREATE TABLE conversation_state (
  user_id TEXT PRIMARY KEY,                          -- Phone number, digits only
  instance TEXT NOT NULL,                            -- Evolution instance name
  active_flow TEXT,                                  -- Current flow (or null)
  active_subroute TEXT,                              -- Current subroute (or null)
  step TEXT NOT NULL DEFAULT 'start',                -- Current step name
  data JSONB DEFAULT '{}'::jsonb,                    -- Collected data
  updated_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '30 minutes')
);

CREATE INDEX idx_conv_expires ON conversation_state(expires_at);
```

**Example Row**:
```json
{
  "user_id": "5511999999999",
  "instance": "main-instance",
  "active_flow": "digital_certificate",
  "active_subroute": "purchase",
  "step": "ask_email",
  "data": {
    "person_type": "PF",
    "cpf_cnpj": "12345678900"
  },
  "updated_at": "2026-02-11T14:30:00Z",
  "expires_at": "2026-02-11T15:00:00Z"
}
```

---

### chat_messages
```sql
CREATE TABLE chat_messages (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,                             -- Phone number
  instance TEXT NOT NULL,                            -- Evolution instance
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  message_id TEXT UNIQUE,                            -- Evolution message ID (null for outbound)
  text TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_msg_id ON chat_messages(message_id) WHERE message_id IS NOT NULL;
CREATE INDEX idx_chat_user_time ON chat_messages(user_id, created_at DESC);
```

**Purpose**:
- **Audit trail**: Track all conversations
- **Deduplication**: Prevent processing same message twice (via `message_id` unique constraint)
- **Context**: Provide recent history to LLM for better routing
- **Analytics**: Understand user behavior (future)

**Example Rows**:
```
| id | user_id       | direction | message_id | text                      | created_at          |
|----|---------------|-----------|------------|---------------------------|---------------------|
| 1  | 5511999999999 | in        | ABC123     | Oi                        | 2026-02-11 14:00:00 |
| 2  | 5511999999999 | out       | null       | Olá! Como posso ajudar?   | 2026-02-11 14:00:01 |
| 3  | 5511999999999 | in        | ABC124     | Preciso de certificado    | 2026-02-11 14:01:00 |
```

---

## Deployment Architecture

### Vercel Serverless

**Platform**: Vercel
**Region**: Auto (closest to user)
**Runtime**: Node.js 18+
**Timeout**: 30 seconds max (internal limit: 25s)
**Memory**: 1024MB (default)
**Concurrency**: Auto-scaling (unlimited by default)

**Function Mapping**:
- `/api/health` → `src/app/api/health/route.ts`
- `/api/webhook/evolution` → `src/app/api/webhook/evolution/route.ts`

Each function is a separate serverless invocation.

---

### Environment Variables (Vercel Dashboard)

All sensitive values stored in **Vercel Project Settings → Environment Variables**:

| Variable | Type | Example | Purpose |
|----------|------|---------|---------|
| `SUPABASE_URL` | Secret | `https://xxx.supabase.co` | Database connection |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | `eyJ...` | Database authentication |
| `EVOLUTION_BASE_URL` | Secret | `https://api.evolution.com` | Evolution API endpoint |
| `EVOLUTION_API_KEY` | Secret | `B3...` | Evolution authentication |
| `EVOLUTION_INSTANCE` | Plain | `main-instance` | Instance identifier |
| `GROQ_API_KEYS` | Secret | `key1,key2,key3` | LLM API keys (comma-separated) |
| `WEBHOOK_SECRET` | Secret | `abc123` | Optional webhook validation |
| `LOG_LEVEL` | Plain | `info` | Logging verbosity |
| `NODE_ENV` | Plain | `production` | Environment |

**Environments**:
- **Production**: Used for `main` branch deployments
- **Preview**: Used for PR/branch deployments
- **Development**: Used for local `.env.local`

---

### CI/CD Pipeline

Following [Supabase Managing Environments](https://supabase.com/docs/guides/deployment/managing-environments):

```
Developer creates feature branch from develop
  ↓
Develops locally (Docker Supabase + Next.js dev server)
  ↓
Push to GitHub → Open PR to develop
  ↓
GitHub Actions CI (ci.yml):
  ├─ Start local Supabase
  ├─ Apply migrations
  ├─ Validate TypeScript types match schema
  └─ Run lints
  ↓
Merge to develop
  ↓
GitHub Actions Staging (staging.yml):         Vercel deploys preview:
  ├─ supabase link --project-ref STAGING      ├─ npm install
  └─ supabase db push (migrations)            ├─ npm run build
                                              └─ Deploy to preview URL
  ↓
Test on staging (preview URL + staging Supabase)
  ↓
Merge develop to main
  ↓
GitHub Actions Production (production.yml):   Vercel deploys production:
  ├─ supabase link --project-ref PRODUCTION   ├─ npm install
  └─ supabase db push (migrations)            ├─ npm run build
                                              └─ Deploy to production URL
```

**GitHub Actions Workflows** (`.github/workflows/`):
- `ci.yml` — On PR: validate types, lint migrations
- `staging.yml` — On merge to develop: deploy migrations to staging Supabase
- `production.yml` — On merge to main: deploy migrations to production Supabase

**CI/CD Secrets** (GitHub Repository → Settings → Secrets):
| Secret | Purpose |
|--------|---------|
| `SUPABASE_ACCESS_TOKEN` | CLI authentication |
| `SUPABASE_DB_PASSWORD_STAGING` | Staging DB password |
| `SUPABASE_DB_PASSWORD_PRODUCTION` | Production DB password |
| `STAGING_PROJECT_ID` | Staging project ref |
| `PRODUCTION_PROJECT_ID` | Production project ref |

**Rollback**:
- **Vercel**: One-click rollback in Dashboard, zero downtime
- **Database**: Create new migration that reverses the change, merge to main

---

## Security Considerations

### Secrets Management
- ✅ All secrets in environment variables (never in code)
- ✅ Different secrets for dev/preview/production
- ✅ Rotate Evolution API key periodically (quarterly)
- ✅ Rotate Groq API keys if compromised
- ❌ Never commit `.env.local` to git

### Webhook Security
- Optional `WEBHOOK_SECRET` header validation
- Verify request origin (Evolution API IP, if static)
- Rate limiting per user (10/min, 100/hr)
- Ignore group messages (prevent public exposure)

### Data Privacy
- 🔒 No PII in logs (mask CPF, email, phone in production)
- 🔒 Encrypt sensitive data in database (Supabase TDE enabled by default)
- 🔒 Session data expires automatically (30-min TTL)
- 🔒 GDPR compliance: User can request data deletion
- 🔒 Audit trail: Keep chat_messages for 90 days (configurable)

### Input Validation
- ✅ Validate all LLM outputs with Zod before using
- ✅ Sanitize user inputs before DB storage (prevent SQL injection)
- ✅ Validate phone number format (prevent spoofing)
- ✅ Rate limit to prevent abuse

---

## Performance Characteristics

### Expected Latencies
| Operation | p50 | p95 | p99 |
|-----------|-----|-----|-----|
| Webhook → Response | 2s | 5s | 10s |
| Database query | 50ms | 200ms | 500ms |
| Groq LLM call | 500ms | 1.5s | 3s |
| Evolution sendText | 200ms | 500ms | 1s |

**Total Processing Time**: 2-5 seconds (p50)

### Bottlenecks
1. **LLM calls** (slowest component)
   - Mitigation: Groq is very fast (< 1.5s typically)
   - Avoid unnecessary LLM calls (use rules where possible)
2. **Database connection pooling**
   - Critical in serverless environment
   - Supabase connection pooler handles this
3. **Evolution API rate limits**
   - Check Evolution docs for limits
   - Respect rate limits to avoid blocking

### Scaling
- **Horizontal**: Vercel auto-scales serverless functions
  - Can handle 1000+ concurrent requests
  - No manual scaling configuration needed
- **Database**: Supabase connection pooler handles serverless connections
  - Up to 15 concurrent connections on free tier
  - Upgrade to Pro for more connections
- **LLM**: Groq free tier limits per API key
  - Use multiple keys (rotation) to increase throughput
  - Monitor usage in Groq console

---

## Monitoring & Alerts

### Key Metrics to Track
| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Webhook processing time | < 5s (p95) | > 10s (p95) |
| Error rate | < 1% | > 5% in 5 min |
| LLM call latency | < 1.5s (p50) | > 5s (p95) |
| LLM confidence | > 0.80 avg | < 0.60 avg |
| Database query time | < 200ms (p95) | > 2s |
| Evolution API success rate | > 99% | < 95% |

### Logging
**Format**: Structured JSON logs to stdout
**Destination**: Vercel automatically captures and displays
**Integration**: Can forward to external services (Datadog, LogDNA, etc.)

**Example Log Entry**:
```json
{
  "level": "info",
  "timestamp": "2026-02-11T14:30:45.123Z",
  "correlation_id": "req_abc123",
  "user_id": "5511999999999",
  "instance": "main-instance",
  "event": "llm_call",
  "llm_type": "global_router",
  "confidence": 0.95,
  "flow": "digital_certificate",
  "duration_ms": 1234
}
```

### Alerts (Manual Review for MVP)
**Daily**:
- Check Vercel dashboard for errors
- Review function invocation count
- Check function duration (look for slow requests)

**Weekly**:
- Review Groq usage and costs
- Check Supabase database size and query performance
- Review error patterns

**As Needed**:
- Monitor Evolution API status
- Check for unusual user behavior (spam, abuse)

---

## Future Enhancements

### Phase 2 (Post-MVP)
1. **Human Handoff**:
   - Telegram/Discord notification when user needs human help
   - Admin dashboard to view active conversations
2. **Analytics Dashboard**:
   - Flow completion rates
   - Average conversation length
   - LLM confidence scores over time
3. **Advanced Rate Limiting**:
   - Per-flow limits (stricter for expensive operations)
   - VIP user whitelist
4. **Queue System** (if volume increases):
   - BullMQ + Redis for async processing
   - Retry failed operations automatically

### Phase 3 (Scale)
1. **Multi-tenancy**:
   - Support multiple Evolution instances
   - Per-instance configuration
2. **A/B Testing**:
   - Test different prompts
   - Compare LLM models
3. **Advanced Analytics**:
   - User sentiment analysis
   - Conversation quality metrics
4. **Compliance**:
   - LGPD/GDPR full compliance
   - Data retention policies
   - User data export/deletion

---

## Resources

- [Next.js Deployment](https://nextjs.org/docs/deployment)
- [Vercel Serverless Functions](https://vercel.com/docs/functions)
- [Supabase Connection Pooling](https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler)
- [Groq API Documentation](https://console.groq.com/docs)
- [Evolution API Documentation](https://doc.evolution-api.com/)
