# Mistral STT (Voxtral) as Alternative to Groq Whisper

## Context

STT is currently hardcoded to Groq Whisper (`whisper-large-v3`) in `src/lib/stt/client.ts`. Mistral offers Voxtral (`voxtral-mini-latest`) via the same `/v1/audio/transcriptions` endpoint shape, supports Portuguese and `.ogg`, and works on the free tier (confirmed by test call). We want a simple `STT_PROVIDER` env var to switch between Groq and Mistral for transcription.

## Key API differences

|  | Groq Whisper | Mistral Voxtral |
|---|---|---|
| Model | `whisper-large-v3` | `voxtral-mini-latest` |
| Context hints | `prompt` param (free text) | `context_bias` param (comma-separated terms, up to 100) |
| Language | `language: "pt"` | `language: "pt"` (but incompatible with `timestamp_granularities`) |
| File extension check | Validates by filename extension | No known restriction |
| Timeout behavior | `APIConnectionTimeoutError` class | Same (OpenAI SDK) |

The `prompt` → `context_bias` difference is the main thing requiring provider-specific handling.

## Files to Modify

- `src/lib/stt/client.ts` — add provider resolution, provider-specific params
- `src/lib/stt/index.ts` — export `SttProviderId` type
- `.env.example` — add `STT_PROVIDER` env var
- `docs/ENVIRONMENT.md` — document new env var
- `CLAUDE.md` — update to mention STT provider choice

## Step-by-step Plan

### Step 1: Refactor `src/lib/stt/client.ts`

Add STT provider resolution at the top:

```ts
type SttProviderId = "groq" | "mistral";

function getSttProvider(): SttProviderId {
  const raw = process.env.STT_PROVIDER;
  if (raw === "mistral") return "mistral";
  return "groq"; // default
}
```

Add provider-specific config (model + transcription params):

```ts
const STT_CONFIG = {
  groq: {
    model: "whisper-large-v3",
    // Whisper uses `prompt` for context hints
    extraParams: () => ({
      prompt: "Transcrição de conversa por WhatsApp. O usuário pode ditar: ...",
      language: "pt",
    }),
  },
  mistral: {
    model: "voxtral-mini-latest",
    // Voxtral uses `context_bias` (comma-separated terms, max 100)
    extraParams: () => ({
      context_bias: "arroba,ponto,com,org,br,CPF,CNPJ,DDD",
      language: "pt",
    }),
  },
} as const;
```

In `transcribeAudio()`:

- Resolve provider via `getSttProvider()` → `getProvider(providerId)` (reuse existing `providers.ts`)
- Select config from `STT_CONFIG[providerId]`
- Pass `config.model` and spread `config.extraParams()` into the `create()` call
- Log `stt_provider` in all log events for observability
- Keep the same error handling (429 retry, timeout retry) — works identically since both use OpenAI SDK

The `temperature: 0` param works for both providers (standard OpenAI-compatible param).

### Step 2: Export type from `src/lib/stt/index.ts`

```ts
export { transcribeAudio, type SttProviderId } from "./client";
```

### Step 3: Update documentation

- `.env.example` — Add `# STT_PROVIDER=groq` (default) with comment listing options
- `docs/ENVIRONMENT.md` — Document `STT_PROVIDER` in the env vars section
- `CLAUDE.md` — Add STT provider info to LLM Conventions section

### Step 4: Update `CHANGELOG.md`

Add entry under `### Added` for Mistral Voxtral STT support.

## Verification

1. **Build check:** `npm run build` — no type errors
2. **Lint check:** `npm run lint` — clean
3. **Default behavior** (no `STT_PROVIDER` set): sends audio message, logs show `stt_provider: "groq"`, transcription works as before
4. **Mistral STT:** set `STT_PROVIDER=mistral` in `.env.local`, send audio message, logs show `stt_provider: "mistral"` and transcription succeeds
