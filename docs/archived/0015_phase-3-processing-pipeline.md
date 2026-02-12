# Phase 3 — Processing Pipeline (Dedupe + Session Load)

## Context

Phases 0–2 built the webhook handler with normalization and guards (fromMe, groups, media, empty text). The repository layer (`insertInboundIfNew`, `getSession`) and Evolution client (`sendText`) already exist but are not yet wired into the webhook handler. Phase 3 connects them to achieve safe, idempotent processing — retry storms from Evolution API must not cause duplicate replies.

**Scope:** Only `src/app/api/webhook/evolution/route.ts` needs changes. No new files.

---

## Changes to `src/app/api/webhook/evolution/route.ts`

### 1. Add imports

```typescript
import { insertInboundIfNew, getSession, type SessionState } from "@/lib/db";
```

### 2. Replace Phase 3 TODOs

After `"guard_passed"` log (~line 73), replace with:

#### a) Deduplication

```typescript
const dedupeStart = performance.now();
let isNewMessage: boolean;

try {
  isNewMessage = await insertInboundIfNew(
    message.messageId,
    message.userId,
    message.instanceName,
    message.text,
  );
} catch (err) {
  logger.error({
    correlation_id: correlationId,
    event: "dedupe_error",
    user_id: message.userId,
    instance: message.instanceName,
    error: err instanceof Error ? err.message : String(err),
  });
  return NextResponse.json({ ok: true });
}

const dedupeDuration = Math.round(performance.now() - dedupeStart);

if (!isNewMessage) {
  logger.info({
    correlation_id: correlationId,
    event: "message_duplicate",
    user_id: message.userId,
    instance: message.instanceName,
    message_id: message.messageId,
    duration_ms: dedupeDuration,
  });
  return NextResponse.json({ ok: true });
}

logger.info({
  correlation_id: correlationId,
  event: "new_message_stored",
  user_id: message.userId,
  instance: message.instanceName,
  message_id: message.messageId,
  duration_ms: dedupeDuration,
});
```

- `insertInboundIfNew` returns `false` on duplicate (`23505` unique_violation) — early return, no further processing.
- On any other DB error — log and return 200 to prevent Evolution retries.

#### b) Session loading

```typescript
const sessionStart = performance.now();
let session: SessionState | null;

try {
  session = await getSession(message.userId);
} catch (err) {
  logger.error({
    correlation_id: correlationId,
    event: "session_load_error",
    user_id: message.userId,
    instance: message.instanceName,
    error: err instanceof Error ? err.message : String(err),
  });
  return NextResponse.json({ ok: true });
}

const sessionDuration = Math.round(performance.now() - sessionStart);

logger.info({
  correlation_id: correlationId,
  event: session ? "session_loaded" : "session_new_user",
  user_id: message.userId,
  instance: message.instanceName,
  ...(session && {
    flow: session.activeFlow,
    step: session.step,
  }),
  duration_ms: sessionDuration,
});
```

- `getSession` already handles expiry internally (deletes expired rows, returns `null`).
- `null` means new user or expired session — Phase 4 will run the global router.
- On DB error — log and return 200.

#### c) Phase 4+ placeholder

```typescript
// TODO Phase 4: Route message (globalRouter / topicShift)
// TODO Phase 5: Execute flow step + send reply + persist outbound + upsert session
// Available context: message (NormalizedMessage), session (SessionState | null), correlationId

return NextResponse.json({ ok: true });
```

### 3. Design decisions

- **No `processMessage()` extraction** — only 2 operations; extract in Phase 4 when routing logic arrives
- **No user-facing error messages on DB failure** — defer to Phase 4's unified reply pattern
- **Always return 200** — prevents Evolution retry storms even on errors
- **`performance.now()` duration tracking** — monitors DB latency per `ARCHITECTURE.md` targets (<200ms p95)

---

## Verification

| # | Test | Expected Result |
|---|---|---|
| 1 | `npm run build` | Type-checks cleanly |
| 2 | Send a new WhatsApp message | Logs: `webhook_received` → `guard_passed` → `new_message_stored` → `session_new_user`; `chat_messages` table has one new row |
| 3 | Replay same webhook payload | Logs: `message_duplicate`, no second row in DB |
| 4 | Insert a `conversation_state` row manually, send message | Logs: `session_loaded` with flow/step |
| 5 | Insert expired session (`expires_at` in the past), send message | Logs: `session_new_user` |
