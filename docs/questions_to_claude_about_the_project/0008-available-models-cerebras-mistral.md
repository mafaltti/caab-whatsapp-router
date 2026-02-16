# Available Models Research — Cerebras & Mistral

## QUESTION: Now we need to check the available models for mistral and cerebras. I searched and found "cerebras/qwen-3-235b" and "cerebras/llama-3.3-70b" for Cerebras and "mistral/mistral-large-latest" and "voxtral-mini-latest" (speech-to-text) for Mistral. Do a deeper research.

*2 Task agents finished*
- *Research Cerebras available models · 16 tool uses · 28.2k tokens*
- *Research Mistral available models · 22 tool uses · 32.2k tokens*

Here's what I found:

## Cerebras

| Model ID | Params | Speed | Price (in/out per 1M) | Notes |
|---|---|---|---|---|
| `llama3.1-8b` | 8B | ~2,200 tok/s | $0.10 / $0.10 | 8K context only |
| `llama-3.3-70b` | 70B | ~2,100 tok/s | $0.85 / $1.20 | Deprecated today (Feb 16) |
| `gpt-oss-120b` | 120B | ~3,000 tok/s | $0.35 / $0.75 | 131K context, reasoning support |
| `qwen-3-32b` | 32B | ~2,600 tok/s | $0.40 / $0.80 | Also deprecated today |
| `qwen-3-235b-a22b-instruct-2507` | 235B MoE | ~1,400 tok/s | $0.60 / $1.20 | Preview only (not for production) |

**Key takeaway:** After today's deprecations, `gpt-oss-120b` is the only solid production model. No STT support at all.

## Mistral

### Chat models (most relevant)

| Model ID | Price (in/out per 1M) | Notes |
|---|---|---|
| `mistral-small-latest` (3.2) | $0.06 / $0.18 | 24B, vision, very cost-effective |
| `mistral-large-latest` (3) | $0.50 / $1.50 | 41B active/675B total, 256K context |
| `mistral-medium-latest` | $0.40 / $2.00 | Premier tier |
| `open-mistral-nemo` | $0.02 / $0.04 | 12B, cheapest, older generation |
| `magistral-small-latest` | Open | Reasoning model (chain-of-thought) |
| `magistral-medium-latest` | Premier | Best reasoning |

### STT (Voxtral)

| Model ID | Endpoint | Price | Notes |
|---|---|---|---|
| `voxtral-mini-latest` | `/v1/audio/transcriptions` | $0.003/min | Supports Portuguese, `.ogg` format, diarization. Cheaper than Whisper |

## Important corrections

- Model IDs have no prefix — use `mistral-small-latest`, not `mistral/mistral-small-latest`
- Same for Cerebras — use `gpt-oss-120b`, not `cerebras/qwen-3-235b`

## Recommendations for this project

- **Cerebras:** `gpt-oss-120b` is the only viable production model (same model we already use on Groq, interestingly)
- **Mistral chat:** `mistral-small-latest` — best price/performance for classification and extraction tasks
- **Mistral STT:** `voxtral-mini-latest` — potential Whisper replacement (Portuguese supported, cheaper, claims better accuracy)

Want me to update the default models in `providers.ts` or start wiring up Mistral STT as an alternative to Groq Whisper?
