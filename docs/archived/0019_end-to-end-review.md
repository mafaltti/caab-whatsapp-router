# End-to-End Critical Review and Hardening Plan

## Summary
The codebase is structurally clean and compiles (`npx tsc --noEmit` passes, `npm run lint` passes), but there are several production-critical flaws around security, tenant isolation, delivery guarantees, and reliability. Below is a decision-complete remediation plan based on concrete findings.

## Critical Findings (Ordered by Severity)

1. **Webhook endpoint is unauthenticated**
- Evidence: `src/app/api/webhook/evolution/route.ts:8` accepts any POST, with no signature/header secret verification.
- Evidence: `WEBHOOK_SECRET` exists but is unused: `.env.example:14`.
- Risk: Anyone can trigger LLM calls, database writes, and outbound sends (abuse/cost/security incident).
- Plan:
  - Require and validate a shared secret header before `request.json()`.
  - Reject unauthorized requests with `401`.
  - Add replay protection (timestamp + tolerance) if Evolution supports signed payloads.

2. **Multi-tenant/session isolation is broken (cross-instance data bleed)**
- Evidence: session primary key is only `user_id`: `supabase/migrations/20260212051650_init.sql:3`.
- Evidence: session reads/writes keyed only by `user_id`: `src/lib/db/sessionRepo.ts:21`, `src/lib/db/sessionRepo.ts:68`, `src/lib/db/sessionRepo.ts:78`.
- Evidence: chat history query keyed only by `user_id`: `src/lib/db/messageRepo.ts:63`.
- Evidence: dedupe unique index is only `message_id`: `supabase/migrations/20260212051650_init.sql:27`.
- Evidence: route loads session with only user id: `src/app/api/webhook/evolution/route.ts:125`.
- Risk: two instances sharing the same phone can overwrite each other's state/history; false dedupes across instances.
- Plan:
  - Make session identity composite: `(instance, user_id)`.
  - Scope all chat/session queries by both `instance` and `user_id`.
  - Change dedupe uniqueness to `(instance, message_id)` partial unique index.
  - Migrate existing data safely with backfill SQL and index swaps.

3. **Conversation state advances even when outbound send fails**
- Evidence: `sendText` returns `false` on failure instead of throwing: `src/lib/evolution/client.ts:33`, `src/lib/evolution/client.ts:57`.
- Evidence: caller ignores return value and still persists outbound record: `src/lib/routing/routeMessage.ts:128`, `src/lib/routing/routeMessage.ts:136`.
- Evidence: session is upserted before send attempt: `src/lib/routing/routeMessage.ts:118`.
- Risk: "phantom replies" in DB/history, user never receives message, flow state becomes inconsistent.
- Plan:
  - Treat failed send as non-committed step: only persist outbound + advance state after successful delivery.
  - If send fails, keep prior step and enqueue retry/dead-letter event.

4. **Error handling returns 200 on internal failures, causing silent message loss**
- Evidence: returns `{ ok: true }` after dedupe/session/internal errors: `src/app/api/webhook/evolution/route.ts:94`, `src/app/api/webhook/evolution/route.ts:134`, `src/app/api/webhook/evolution/route.ts:161`.
- Risk: upstream stops retrying while message was never processed.
- Plan:
  - Return non-2xx for retriable server failures (DB unavailable, routing failures).
  - Add idempotent processing + retry-safe behavior.
  - Optionally move heavy processing to queue and ack webhook only after enqueue.

## High Findings

1. **PII exposure to LLM/logging path**
- Evidence: prompt includes raw chat text/history: `src/lib/llm/prompts.ts:9`, `src/lib/llm/prompts.ts:52`, `src/lib/llm/prompts.ts:80`.
- Evidence: partial raw model output logged: `src/lib/llm/globalRouter.ts:38`, `src/lib/llm/globalRouter.ts:49`, `src/lib/llm/topicShift.ts:121`.
- Risk: personal data leakage into third-party LLM/log stream.
- Plan:
  - Redact/mask CPF/CNPJ/email/phone before prompt assembly where possible.
  - Remove `raw_content` logging in production.
  - Add explicit privacy guardrail layer.

2. **Event-type validation missing**
- Evidence: schema accepts generic `event: string` but no enforcement before processing: `src/lib/webhook/normalize.ts:29`.
- Risk: non-message events can accidentally enter pipeline.
- Plan:
  - Explicit allowlist (e.g., `messages.upsert`) and early no-op for others.

3. **No automated tests for core behavior**
- Evidence: no `*.test*`/`*.spec*` files found.
- Risk: regressions in guards/dedupe/routing/session lifecycle.
- Plan:
  - Add unit tests for `normalize/applyGuards`, repos, and routing decisions.
  - Add API integration tests for webhook happy path + retries + duplicate delivery.

4. **Docs promise features not yet implemented**
- Evidence: docs state rate limiting/PII controls (`docs/ARCHITECTURE.md:822`, `docs/ARCHITECTURE.md:826`) and full flow engine, but runtime still returns placeholder replies: `src/lib/routing/routeMessage.ts:20`, `src/lib/routing/routeMessage.ts:77`.
- Risk: operational expectations mismatch.
- Plan:
  - Mark docs as "planned vs implemented" and gate production go-live on implemented controls.

## Public API / Interface / Schema Changes

1. Database:
- `conversation_state` primary key: from `user_id` to composite `(instance, user_id)`.
- `chat_messages` dedupe index: from `UNIQUE(message_id)` to partial `UNIQUE(instance, message_id) WHERE message_id IS NOT NULL`.
- Add composite read index on `chat_messages(instance, user_id, created_at DESC)`.

2. Repository signatures:
- `getSession(userId)` -> `getSession(instance, userId)`
- `clearSession(userId)` -> `clearSession(instance, userId)`
- `loadRecentMessages(userId, limit)` -> `loadRecentMessages(instance, userId, limit)`
- `insertInboundIfNew(messageId, userId, instance, text)` keeps args but dedupe logic uses instance+messageId.

3. Webhook contract:
- Require auth header (`x-webhook-secret` or provider-specific signature).
- Reject unauthorized and unsupported event types explicitly.

## Test Cases and Scenarios

1. Auth:
- Missing secret -> `401`.
- Invalid secret -> `401`.
- Valid secret -> proceeds.

2. Tenant isolation:
- Same `user_id` across two instances must keep separate session/state/history.
- Duplicate `message_id` in different instances must both process.

3. Delivery guarantees:
- `sendText` failure must not persist outbound message nor advance step.
- Retry path should process idempotently after transient failure.

4. Reliability:
- DB transient failure should return retriable status (non-2xx).
- Duplicate webhook delivery should produce single outbound.

5. Privacy:
- Redaction tests for CPF/CNPJ/email/phone in logs/prompts.
- Assert no raw LLM content logging in production mode.

## Assumptions and Defaults

1. Default tenant boundary is `(instance, user_id)` (not global `user_id`).
2. Webhook source supports static shared secret if full signature verification is unavailable.
3. For reliability, default behavior is "fail closed" on internal processing errors (retryable status) rather than always `200`.
4. Privacy default is "no raw user content in logs" in production.
