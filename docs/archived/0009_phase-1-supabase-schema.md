# Phase 1 — Supabase Schema + Repositories

## Context

The project completed Phase 0 (Next.js bootstrap) and Phase 0.5 (CI/CD workflows). The database has no tables yet — `src/lib/db/types.ts` exists but reflects an empty schema, and `src/lib/db/` has no repository code. This phase builds the persistence layer that all subsequent phases depend on: two tables, seed data, a Supabase client, and repository modules for session state and message history.

---

## Implementation Steps

### Step 1: Create migration file

Run `supabase migration new init` to create `supabase/migrations/<timestamp>_init.sql`, then write:

```sql
-- conversation_state: active session per user
CREATE TABLE conversation_state (
  user_id         TEXT PRIMARY KEY,
  instance        TEXT NOT NULL,
  active_flow     TEXT,
  active_subroute TEXT,
  step            TEXT NOT NULL DEFAULT 'start',
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 minutes')
);

CREATE INDEX idx_conv_expires ON conversation_state (expires_at);

-- chat_messages: inbound + outbound message log
CREATE TABLE chat_messages (
  id          BIGSERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL,
  instance    TEXT NOT NULL,
  direction   TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  message_id  TEXT,
  text        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partial unique index: dedup inbound messages by message_id (nulls excluded)
CREATE UNIQUE INDEX idx_msg_id ON chat_messages (message_id) WHERE message_id IS NOT NULL;
CREATE INDEX idx_chat_user_time ON chat_messages (user_id, created_at DESC);
```

> **Note:** No column-level `UNIQUE` on `message_id` — the partial index handles dedup while allowing multiple null values (outbound messages).

### Step 2: Create `supabase/seed.sql`

Test data with 3 users:

- **User `5511999990001`**: Active session in `digital_certificate` > `purchase` > `ask_cpf` with 5 chat messages
- **User `5511999990002`**: Active session in `billing` > `ask_invoice_id` with 2 chat messages
- **User `5511999990003`**: Expired session (`expires_at` in the past) for testing expiry detection
- Known `message_id` values (e.g. `MSG_DEDUP_TEST_001`) for testing dedup behavior

### Step 3: Apply migration + seed locally

```bash
supabase db reset
```

### Step 4: Regenerate TypeScript types

```bash
supabase gen types typescript --local > src/lib/db/types.ts
```

This overwrites the empty-schema types with full table definitions including `Row`, `Insert`, `Update` variants.

### Step 5: Create `src/lib/db/supabase.ts` — Supabase client

- Singleton pattern (module-level `export const supabase = ...`)
- Uses `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` env vars
- Typed with `Database` from generated types
- Auth disabled (`autoRefreshToken: false`, `persistSession: false`)
- Throws on missing env vars at load time

### Step 6: Create `src/lib/db/sessionRepo.ts` — Session repository

Exports `SessionState` interface (camelCase) and three functions:

- **`getSession(userId)`** → `SessionState | null`
  - Fetches row by PK with `.single()`
  - Checks `expires_at` — if expired, deletes row and returns `null`
  - Maps snake_case DB columns to camelCase interface

- **`upsertSession(session)`** → `void`
  - Uses `.upsert()` with `onConflict: 'user_id'`
  - Always sets `expires_at = now + 30 min` (TTL refresh)
  - Always sets `updated_at = now`

- **`clearSession(userId)`** → `void`
  - Deletes row from `conversation_state`
  - Chat messages preserved for audit

### Step 7: Create `src/lib/db/messageRepo.ts` — Message repository

Exports `ChatMessage` interface and three functions:

- **`insertInboundIfNew(messageId, userId, instance, text)`** → `boolean`
  - INSERTs and catches unique violation (`error.code === '23505'`)
  - Returns `true` = new message, `false` = duplicate
  - No SELECT-then-INSERT (avoids race condition under concurrent webhooks)

- **`insertOutbound(userId, instance, text)`** → `void`
  - INSERTs with `direction: 'out'`, `message_id: null`

- **`loadRecentMessages(userId, limit=5)`** → `ChatMessage[]`
  - Fetches newest N messages, reverses to chronological order for LLM context

### Step 8: Create `src/lib/db/index.ts` — Barrel export

Re-exports all public functions and types from `supabase.ts`, `sessionRepo.ts`, `messageRepo.ts`.

### Step 9: Delete `.gitkeep` from `src/lib/db/`

The directory now has real files — remove the placeholder.

---

## Files Modified/Created

| File | Action |
|---|---|
| `supabase/migrations/<timestamp>_init.sql` | Create (via `supabase migration new`) |
| `supabase/seed.sql` | Create |
| `src/lib/db/types.ts` | Overwrite (via `supabase gen types`) |
| `src/lib/db/supabase.ts` | Create |
| `src/lib/db/sessionRepo.ts` | Create |
| `src/lib/db/messageRepo.ts` | Create |
| `src/lib/db/index.ts` | Create |

---

## Verification

| # | Test | Expected Result |
|---|---|---|
| 1 | `supabase db reset` | Applies migrations and seed without errors |
| 2 | Supabase Studio (`localhost:54323`) | Both tables visible with seed data |
| 3 | Dedup test | Re-inserting `MSG_DEDUP_TEST_001` fails with unique violation |
| 4 | Null `message_id` test | Multiple outbound inserts with `message_id = null` succeed |
| 5 | `npx tsc --noEmit` | TypeScript compiles without errors |
| 6 | `npm run lint` | Passes |
