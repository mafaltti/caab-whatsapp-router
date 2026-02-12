# Phase 2 Complete — Webhook Endpoint + Evolution API Normalization ✅

## Files Created

| File | Purpose |
|---|---|
| `src/lib/shared/types.ts` | `NormalizedMessage` and `GuardResult` interfaces |
| `src/lib/shared/logger.ts` | Structured JSON logger with `LOG_LEVEL` support and `generateCorrelationId()` |
| `src/lib/shared/index.ts` | Barrel exports |
| `src/lib/evolution/client.ts` | `sendText()` — POST to Evolution API with 5s timeout, lazy env validation |
| `src/lib/evolution/index.ts` | Barrel exports |
| `src/lib/webhook/normalize.ts` | Zod schema for Evolution v2 payload, `normalizeMessage()`, `applyGuards()` |
| `src/lib/webhook/index.ts` | Barrel exports |

## File Modified

| File | Changes |
|---|---|
| `src/app/api/webhook/evolution/route.ts` | Full POST handler: correlationId, JSON parse, normalize, guards, auto-reply, TODO stubs for Phase 3+ |

## Key Design Decisions

- **Lazy env validation in Evolution client** — `getConfig()` called at runtime, not module load, to avoid build-time errors in Next.js
- **Always returns 200** except for invalid JSON (400), preventing Evolution retry storms
- **Fire-and-forget auto-reply** — `sendText` errors are logged but don't fail the webhook
- **Guard order:** `fromMe` → `isGroup` → `@lid` → message type (sticker silent, media auto-reply, unknown silent)
- **Zod v4 import path** (`zod/v4`) matching the installed `zod@^4.3.6` package
