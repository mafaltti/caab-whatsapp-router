# Provider Switching Guide

This project uses multiple AI providers for two distinct tasks: **LLM** (text generation/classification) and **STT** (speech-to-text). Each can be configured independently via environment variables in `.env.local`.

---

## STT (Speech-to-Text) Providers

Controlled by the `STT_PROVIDER` env var. Only one STT provider is active at a time.

| Provider | Model | `STT_PROVIDER` value | Context hints | Free tier |
|----------|-------|----------------------|---------------|-----------|
| **Groq Whisper** (default) | `whisper-large-v3` | `groq` or unset | `prompt` (free text) | Yes |
| **Mistral Voxtral** | `voxtral-mini-latest` | `mistral` | `context_bias` (comma-separated terms) | Yes |

### How to switch

Edit `.env.local`:

```bash
# Use Groq Whisper (default — can also just remove the line)
STT_PROVIDER=groq

# Use Mistral Voxtral
STT_PROVIDER=mistral
```

Restart the dev server after changing.

### Requirements

- **Groq**: `GROQ_API_KEYS` must be set (required for the project anyway)
- **Mistral**: `MISTRAL_API_KEYS` must be set

---

## LLM (Text Generation) Providers

The LLM system supports three providers. By default, **all tasks use Groq**. You can route specific tasks to different providers.

| Provider | Default Model | Model override env var | Free tier |
|----------|---------------|------------------------|-----------|
| **Groq** (default) | `openai/gpt-oss-120b` | `GROQ_MODEL` | Yes |
| **Mistral** | `mistral-small-latest` | `MISTRAL_MODEL` | Yes |
| **Cerebras** | `gpt-oss-120b` | `CEREBRAS_MODEL` | Yes |
| **Mafaltti** (self-hosted) | `llama3.1:8b-instruct-q4_K_M` | `MAFALTTI_MODEL` | Self-hosted |

### LLM Tasks

There are 6 routable tasks:

| Task | Description |
|------|-------------|
| `classify_flow` | Determine which flow a message belongs to |
| `classify_subroute` | Pick subroute within a flow |
| `detect_topic_shift` | Detect when user changes topic mid-flow |
| `extract_data` | Extract structured data (CPF, email, phone) |
| `conversational_reply` | Generate natural language replies (unknown flow) |
| `summarize` | Summarize conversation for handoff |

### How to route tasks to providers

Use the `LLM_TASK_ROUTING` env var (comma-separated `task=provider` pairs):

```bash
# All tasks use Groq (default — no env var needed)
# LLM_TASK_ROUTING=

# Route classification to Mistral, extraction to Cerebras, rest stays on Groq
LLM_TASK_ROUTING=classify_flow=mistral,classify_subroute=mistral,extract_data=cerebras

# Route everything to Mistral
LLM_TASK_ROUTING=classify_flow=mistral,classify_subroute=mistral,detect_topic_shift=mistral,extract_data=mistral,conversational_reply=mistral,summarize=mistral

# Route conversational replies to self-hosted Mafaltti
LLM_TASK_ROUTING=conversational_reply=mafaltti
```

### How to override models

Each provider has a default model, but you can override it:

```bash
# Use a different Groq model
GROQ_MODEL=whisper-large-v3-turbo

# Use a different Mistral model
MISTRAL_MODEL=mistral-medium-latest

# Use a different Cerebras model
CEREBRAS_MODEL=gpt-oss-120b
```

### Requirements

- **Groq**: `GROQ_API_KEYS` (required)
- **Mistral**: `MISTRAL_API_KEYS` (only needed if routing tasks to Mistral)
- **Cerebras**: `CEREBRAS_API_KEYS` (only needed if routing tasks to Cerebras)
- **Mafaltti**: `MAFALTTI_API_KEYS` (only needed if routing tasks to Mafaltti — self-hosted Llama 3.1 8B)

All key env vars accept comma-separated values for round-robin rotation (e.g. `GROQ_API_KEYS=key1,key2,key3`).

---

## Quick Reference

```bash
# .env.local — example with all providers active

# API keys (comma-separated for rotation)
GROQ_API_KEYS=gsk_key1,gsk_key2
MISTRAL_API_KEYS=mk_key1,mk_key2
CEREBRAS_API_KEYS=ck_key1,ck_key2
MAFALTTI_API_KEYS=your-self-hosted-key

# STT: groq (default) or mistral
STT_PROVIDER=groq

# LLM task routing (unset = all Groq)
LLM_TASK_ROUTING=classify_flow=mistral,extract_data=cerebras

# Optional model overrides
# GROQ_MODEL=openai/gpt-oss-120b
# MISTRAL_MODEL=mistral-small-latest
# CEREBRAS_MODEL=gpt-oss-120b
# MAFALTTI_MODEL=llama3.1:8b-instruct-q4_K_M
```

After any change, restart the dev server (`npm run dev`).
