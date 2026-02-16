# Plan: WhatsApp Audio Message Support (Speech-to-Text)

**GitHub Issue:** #3

## Context

Audio/voice messages are the most common WhatsApp interaction pattern, but currently the bot rejects them with a static auto-reply asking users to type text. This creates a poor user experience. The goal is to intercept incoming audio messages, transcribe them to text via a speech-to-text API, then feed the transcribed text into the existing message pipeline as if the user had typed it.

## Research Findings

### Groq Whisper STT (Recommended Provider)

| Detail | Value |
|---|---|
| Endpoint | `POST https://api.groq.com/openai/v1/audio/transcriptions` |
| Model | `whisper-large-v3-turbo` ($0.04/hr, 228x real-time) |
| OGG/Opus support | Native - no conversion needed |
| Portuguese | `language: "pt"` parameter |
| Free tier file limit | 25 MB (plenty for voice messages) |
| Free tier rate limits | 20 RPM, 2K RPD, 7.2K audio sec/hr |
| SDK | `groq-sdk` already in project (`groq.audio.transcriptions.create()`) |
| Key rotation | Same `GROQ_API_KEYS` env var - reuse existing pattern |

**Sources:**
- https://console.groq.com/docs/speech-to-text
- https://groq.com/pricing
- https://console.groq.com/docs/rate-limits

### Evolution API v2 Audio Download

| Detail | Value |
|---|---|
| Endpoint | `POST /chat/getBase64FromMediaMessage/{instance}` |
| Auth | `apikey` header (same `EVOLUTION_API_KEY`) |
| Request body | `{ "message": { "key": { "id": "<msg-id>" } } }` |
| Response | `{ mediaType, fileName, mimetype, base64, size }` |
| Audio format | OGG/Opus, mimetype `audio/ogg; codecs=opus` or `audio/mp4` |

**Sources:**
- https://doc.evolution-api.com/v2/api-reference/chat-controller/get-base64
- https://www.postman.com/agenciadgcode/evolution-api/request/cu2iwuz/get-base64-from-media-message

## Implementation Plan

### Step 1: Add `transcribeAudio()` to STT client

**New file:** `src/lib/stt/client.ts`

Create a Groq Whisper client that mirrors the existing LLM client pattern (`src/lib/llm/client.ts`):

- Reuse `GROQ_API_KEYS` env var with the same round-robin key rotation
- Retry on 429 (`RateLimitError`) rotating to next key
- Accept a `Buffer` + filename, return transcribed text
- Use `whisper-large-v3-turbo` model, `language: "pt"`, `temperature: 0`
- Log duration and audio size (no PII - don't log transcribed text)

```ts
// API: transcribeAudio(audioBuffer: Buffer, fileName: string, correlationId?: string) => Promise<string>
```

Also create `src/lib/stt/index.ts` barrel export.

### Step 2: Add `getMediaBase64()` to Evolution client

**Edit file:** `src/lib/evolution/client.ts`

Add a function to download media from Evolution API:

- `POST /chat/getBase64FromMediaMessage/{instance}`
- Pass message key ID in request body
- Return `{ base64: string, mimetype: string, fileName: string }`
- Use same `EVOLUTION_BASE_URL` + `EVOLUTION_API_KEY` config pattern
- 10s timeout (media download may be slower than text send)

```ts
// API: getMediaBase64(instance: string, messageId: string, correlationId?: string) => Promise<MediaBase64Result>
```

### Step 3: Update webhook normalization to handle audio

**Edit file:** `src/lib/webhook/normalize.ts`

Changes:

1. Refine `MessageType` to distinguish `"audio"` from other `"media"` types
2. Update `getMessageType()`: if `audioMessage` is present, return `"audio"`
3. Update `applyGuards()`: when `messageType === "audio"`, return `{ shouldProcess: true, requiresAudioTranscription: true }` instead of blocking
4. For audio messages, still extract `messageId`, `userId`, `remoteJid`, `instanceName` etc. (set `text: ""` initially)

**Edit file:** `src/lib/shared/types.ts`

Add to `GuardResult`:

```ts
requiresAudioTranscription?: boolean;
```

Add to `NormalizedMessage`:

```ts
mediaType?: "audio" | null;
```

### Step 4: Add audio transcription to webhook pipeline

**Edit file:** `src/app/api/webhook/evolution/route.ts`

In the `after()` callback, after guards pass and before deduplication:

1. Check `guardResult.requiresAudioTranscription`
2. If true: call `getMediaBase64()` → decode base64 to Buffer → call `transcribeAudio()` → set `message.text` to the transcription
3. If transcription fails: send a friendly error reply ("Desculpe, no momento não consigo processar esse áudio. Por favor, envie sua mensagem em texto.")
4. Continue the existing pipeline (dedupe → session → route) with transcribed text

### Step 5: Update message storage for audio

**New migration:** `supabase/migrations/<timestamp>_add_media_type.sql`

```sql
ALTER TABLE chat_messages ADD COLUMN media_type TEXT;
```

**Edit file:** `src/lib/db/messageRepo.ts`

- Update `insertInboundIfNew()` to accept optional `mediaType` parameter
- Pass `media_type` column value when inserting

Regenerate types:

```bash
supabase gen types typescript --local > src/lib/db/types.ts
```

### Step 6: Wire into `insertInboundIfNew` call

**Edit file:** `src/app/api/webhook/evolution/route.ts`

Pass `message.mediaType` (e.g., `"audio"`) to `insertInboundIfNew()` so the stored message records the original media type alongside the transcribed text.

## Files to Create/Modify

| File | Action |
|---|---|
| `src/lib/stt/client.ts` | Create - Groq Whisper transcription client |
| `src/lib/stt/index.ts` | Create - barrel export |
| `src/lib/evolution/client.ts` | Edit - add `getMediaBase64()` |
| `src/lib/webhook/normalize.ts` | Edit - handle audio type in guards |
| `src/lib/shared/types.ts` | Edit - add `mediaType` and `requiresAudioTranscription` fields |
| `src/app/api/webhook/evolution/route.ts` | Edit - audio transcription in pipeline |
| `src/lib/db/messageRepo.ts` | Edit - accept `mediaType` param |
| `supabase/migrations/<ts>_add_media_type.sql` | Create - add `media_type` column |
| `src/lib/db/types.ts` | Regenerate - after migration |

## Key Reuse Points

- **Key rotation:** Reuse exact pattern from `src/lib/llm/client.ts` (lines 20-34) — same `GROQ_API_KEYS` env var, same round-robin `nextKey()`, same `RateLimitError` retry
- **Evolution API config:** Reuse `getConfig()` from `src/lib/evolution/client.ts` (lines 3-10)
- **groq-sdk:** Already a dependency (`^0.37.0`), supports `groq.audio.transcriptions.create()`
- **Logger:** Reuse `@/lib/shared/logger` for all new modules
- **No new env vars needed:** `GROQ_API_KEYS` and `EVOLUTION_BASE_URL`/`EVOLUTION_API_KEY` already exist

## Verification

1. **Build check:** `npm run build` — ensure no type errors
2. **Local DB:** `supabase db reset` — verify migration applies cleanly, then `supabase gen types typescript --local > src/lib/db/types.ts`
3. **Lint:** `npm run lint`
4. **Manual E2E test:** Send a voice message to the bot via WhatsApp → verify:
   - Audio is downloaded from Evolution API
   - Transcription returns Portuguese text
   - Transcribed text routes through the normal pipeline
   - Response is contextually correct
   - `chat_messages` row has `media_type = 'audio'` and transcribed text
5. **Edge cases to test:**
   - Very short audio (< 1 second)
   - Long audio (> 1 minute)
   - Noisy/silent audio
   - STT API failure → graceful fallback message
   - Evolution API media download failure → graceful fallback message
