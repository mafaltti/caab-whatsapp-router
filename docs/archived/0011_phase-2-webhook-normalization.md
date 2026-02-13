# Phase 2 — Webhook Endpoint + Evolution API Normalization

## Context

Phase 0 (bootstrap), 0.5 (multi-env CI/CD), and 1 (Supabase schema + repos) are complete. The DB layer (`sessionRepo`, `messageRepo`, Supabase client) is fully implemented. The webhook route at `src/app/api/webhook/evolution/route.ts` is a stub returning `{ ok: true }`.

Phase 2 establishes the webhook reception layer: receiving raw Evolution API v2 payloads, normalizing them to an internal format, and applying guards (fromMe, groups, media). Phase 2 does **not** include processing, deduplication, or routing (Phase 3+).

We also need a minimal Evolution `sendText` client for auto-replies on media messages, and a structured logger for observability.

---

## Files to Create

### 1. `src/lib/shared/types.ts` — Shared type definitions

Define:

- **`NormalizedMessage`** — canonical internal message format
  - `userId: string` — digits only from remoteJid
  - `messageId: string` — `data.key.id`
  - `instanceName: string` — `instance`
  - `text: string` — extracted text, empty string if no text
  - `fromMe: boolean`
  - `isGroup: boolean`
  - `remoteJid: string` — full JID, needed for replying
  - `timestamp: Date`

- **`GuardResult`** — result of guard checks
  - `shouldProcess: boolean`
  - `reason?: string`
  - `requiresAutoReply: boolean`
  - `autoReplyText?: string`

### 2. `src/lib/shared/logger.ts` — Structured JSON logger

- `generateCorrelationId()` — UUID v4 per webhook call
- `logger.debug/info/warn/error()` — log structured JSON to stdout
- Respects `LOG_LEVEL` env var (default: `info`)
- Format matches the observability spec from `CLAUDE.md` (`level`, `timestamp`, `correlationId`, `event`, etc.)
- PII-safe: never log full message text, CPF, email

### 3. `src/lib/evolution/client.ts` — Minimal Evolution sendText

- **`sendText(instance, remoteJid, text, correlationId)`** → `boolean`
- POST to `${EVOLUTION_BASE_URL}/message/sendText/${instance}`
- Headers: `Content-Type: application/json`, `apikey: ${EVOLUTION_API_KEY}`
- Body: `{ number: remoteJid, text }`
- 5-second timeout via `AbortSignal.timeout(5000)`
- No retries (serverless constraint)
- Returns `true`/`false` (fire-and-forget for auto-replies)
- Validate env vars at module level (same pattern as `supabase.ts`)

### 4. `src/lib/webhook/normalize.ts` — Payload normalization + guards

**Zod schema for Evolution API v2 `messages.upsert` payload:**

```typescript
const EvolutionMessageSchema = z.object({
  conversation: z.string().optional(),
  extendedTextMessage: z.object({ text: z.string() }).optional(),
  imageMessage: z.unknown().optional(),
  audioMessage: z.unknown().optional(),
  videoMessage: z.unknown().optional(),
  documentMessage: z.unknown().optional(),
  stickerMessage: z.unknown().optional(),
  locationMessage: z.unknown().optional(),
  contactMessage: z.unknown().optional(),
}).optional();

const EvolutionWebhookSchema = z.object({
  event: z.string(),
  instance: z.string(),
  data: z.object({
    key: z.object({
      remoteJid: z.string(),
      fromMe: z.boolean(),
      id: z.string(),
    }),
    message: EvolutionMessageSchema,
    messageTimestamp: z.union([z.number(), z.string()]).optional(),
  }),
});
```

**`normalizeMessage(payload: unknown)`** → `NormalizedMessage | null`

- Validate with `EvolutionWebhookSchema.safeParse(payload)` — return `null` if invalid
- Extract userId: `remoteJid.split('@')[0]`
- Extract text priority: `data.message.conversation` → `data.message.extendedTextMessage.text`
- Normalize whitespace: `text.trim().replace(/\s+/g, ' ')`
- Parse timestamp: `new Date(messageTimestamp * 1000)` (seconds → ms)
- Detect group: `remoteJid.endsWith('@g.us') || remoteJid.endsWith('@lid')`

**`applyGuards(message, rawPayload)`** → `GuardResult`

Guard order:

1. `fromMe === true` → ignore (prevent loops)
2. `isGroup === true` → ignore (no group support)
3. `remoteJid.endsWith('@lid')` → ignore (communities)
4. No text content → detect message type:
   - `stickerMessage` → ignore silently (no auto-reply)
   - `imageMessage` | `audioMessage` | `videoMessage` | `documentMessage` | `locationMessage` | `contactMessage` → ignore + auto-reply
   - Unknown → ignore silently

**Auto-reply text:** "Por favor, envie sua mensagem em formato de texto. No momento não consigo processar imagens, áudios ou documentos."

**Internal helper:** `getMessageType(message)` returns `'text' | 'media' | 'sticker' | 'unknown'` — uses the Zod-parsed message object.

### 5. Barrel exports (`index.ts`) for new modules

- `src/lib/shared/index.ts` — export types + logger
- `src/lib/webhook/index.ts` — export normalize
- `src/lib/evolution/index.ts` — export client

---

## Files to Modify

### 6. `src/app/api/webhook/evolution/route.ts` — Implement POST handler

Replace the stub with:

1. Generate `correlationId`
2. Parse JSON (return 400 on invalid JSON)
3. Log `webhook_received`
4. `normalizeMessage(payload)` — return 200 if `null` (invalid structure)
5. `applyGuards(message, payload)` — if `!shouldProcess`:
   - If `requiresAutoReply` → `sendText(...)` (fire-and-forget, don't fail on error)
   - Return 200
6. Log `guard_passed` with `userId`, `messageId`, `textLength`
7. TODO comments for Phase 3+ integration points
8. Return 200

> **Important:** Always return `200 OK` (even on errors) to prevent Evolution retry storms. Only exception: `400` for non-JSON body.

Wrap entire handler in try/catch — log any unexpected error and return 200.

---

## Reuse Existing Code

- `src/lib/db/supabase.ts` — Pattern for env var validation at module level (reuse in Evolution client)
- `src/lib/db/index.ts` — Pattern for barrel exports (reuse for `shared`/`webhook`/`evolution`)
- **NOT** using DB layer in Phase 2 (no deduplication or session loading — that's Phase 3)

---

## Verification

| # | Test | Expected Result |
|---|---|---|
| 1 | `npm run build` | No TypeScript errors |
| 2 | `npm run lint` | Passes |
| 3 | curl — invalid payload | 200 OK, log shows `normalization_failed` |
| 4 | curl — valid text message | 200 OK, log shows `guard_passed` |
| 5 | curl — fromMe guard | Log shows `guard_applied` reason `fromMe` |
| 6 | ngrok + real WhatsApp | Text → logs show normalized message; Image → auto-reply received |

### curl test commands

**Invalid payload:**

```bash
curl -X POST http://localhost:3000/api/webhook/evolution \
  -H "Content-Type: application/json" \
  -d '{"test":true}'
```

**Valid text message:**

```bash
curl -X POST http://localhost:3000/api/webhook/evolution \
  -H "Content-Type: application/json" \
  -d '{
    "event": "messages.upsert",
    "instance": "test",
    "data": {
      "key": {
        "remoteJid": "5511999999999@s.whatsapp.net",
        "fromMe": false,
        "id": "MSG001"
      },
      "message": {
        "conversation": "Hello"
      },
      "messageTimestamp": 1707570000
    }
  }'
```

**fromMe guard (same payload with `"fromMe": true`):**

```bash
curl -X POST http://localhost:3000/api/webhook/evolution \
  -H "Content-Type: application/json" \
  -d '{
    "event": "messages.upsert",
    "instance": "test",
    "data": {
      "key": {
        "remoteJid": "5511999999999@s.whatsapp.net",
        "fromMe": true,
        "id": "MSG002"
      },
      "message": {
        "conversation": "Hello"
      },
      "messageTimestamp": 1707570000
    }
  }'
```
