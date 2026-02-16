# Mistral STT as Alternative to Groq Whisper — Implementation Approach

## QUESTION: What about "Mistral STT as an alternative to Groq Whisper", how do you think we should implement it?

Good question. Here's my thinking:

## Current state

`src/lib/stt/client.ts` is hardcoded to `getProvider("groq")` with Whisper-specific params (`model: "whisper-large-v3"`, `prompt` for context hints, `language: "pt"`).

## Key difference between providers

|  | Groq Whisper | Mistral Voxtral |
|---|---|---|
| Model ID | `whisper-large-v3` | `voxtral-mini-latest` |
| Endpoint | `/v1/audio/transcriptions` | `/v1/audio/transcriptions` |
| Price | Free tier (rate limited) | $0.003/min |
| Portuguese | Yes | Yes |
| `.ogg` support | Yes | Yes |
| Context hints | `prompt` param | "context biasing" (may differ) |
| Accuracy (claimed) | ~5-8% WER | ~4% WER |

The endpoint shape is the same (OpenAI-compatible), but the `prompt` parameter we use for Whisper context hints (dictated emails, CPFs, etc.) may not work the same way on Voxtral — that needs verification.

## Two approaches

### A) Simple env var switch (`STT_PROVIDER=mistral`)

- One provider at a time, mirrors LLM task routing pattern
- Add STT model/config to `providers.ts` or a small `stt/providers.ts`
- Simplest, low risk

### B) Fallback chain (Groq → Mistral)

- Try primary, fall back to secondary on failure/timeout
- More resilient against rate limits since we're on Groq's free tier
- Slightly more complex but practical given our rate limit reality

I'd lean toward **A first, B later** — start with a simple `STT_PROVIDER` env var (default `"groq"`) so we can test Voxtral in isolation, then optionally add fallback if rate limits become an issue. The unknown is whether Voxtral's context biasing works like Whisper's `prompt` param — if not, we'd need provider-specific parameter handling, which A keeps clean.

Want me to plan the implementation?
