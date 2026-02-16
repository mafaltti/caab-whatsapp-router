# Summary — Audio STT Implementation Complete

**Branch:** `feature/audio-stt`

## Files Created

| File | Purpose |
|---|---|
| `src/lib/stt/client.ts` | Groq Whisper STT client (`whisper-large-v3-turbo`, key rotation, 429 retry) |
| `src/lib/stt/index.ts` | Barrel export |
| `supabase/migrations/20260213120000_add_media_type.sql` | `media_type` column on `chat_messages` |

## Files Modified

| File | Changes |
|---|---|
| `src/lib/shared/types.ts` | `mediaType` on `NormalizedMessage`, `requiresAudioTranscription` on `GuardResult` |
| `src/lib/evolution/client.ts` | `getMediaBase64()` — downloads audio via Evolution API |
| `src/lib/evolution/index.ts` | Exported new function + type |
| `src/lib/webhook/normalize.ts` | `"audio"` message type passes guards, updated media auto-reply text |
| `src/lib/db/messageRepo.ts` | `insertInboundIfNew()` accepts optional `mediaType` |
| `src/lib/db/types.ts` | Regenerated with `media_type` column |
| `src/app/api/webhook/evolution/route.ts` | Audio pipeline: download → transcribe → feed into existing routing |

## Verification

- Migration applied cleanly (`supabase db reset`)
- Types regenerated with `media_type` column
- `npm run build` — no type errors
- `npm run lint` — no warnings

Ready to commit when you'd like.
