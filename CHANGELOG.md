# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Audio message support (speech-to-text) — voice messages are now transcribed via Groq Whisper (`whisper-large-v3`) and fed into the existing message pipeline as text
- Groq STT client (`src/lib/stt/`) with round-robin API key rotation and automatic retry on rate limits, reusing the same `GROQ_API_KEYS` env var
- Whisper transcription prompt with context hints for emails, CPFs, CNPJs, and phone numbers — improves accuracy for dictated structured data
- Evolution API media download (`getMediaBase64`) to fetch audio from WhatsApp via the `getBase64FromMediaMessage` endpoint
- `media_type` column on `chat_messages` to track message origin (e.g. `"audio"`) alongside transcribed text
- Graceful fallback — when transcription fails, the bot replies asking the user to send text instead
- Spoken number conversion (`spokenToDigits`, `extractDigits`) — converts Portuguese number words from audio transcriptions to digits (e.g. "meia nove oito" → "698")
- Fast-path extraction for CPF/CNPJ, phone, and email — bypasses LLM when direct digit/pattern extraction succeeds, reducing latency
- Spoken email normalization (`normalizeSpokenEmail`) — converts "arroba" → @, "ponto" → ., removes spaces for dictated email addresses

### Changed
- STT model upgraded from `whisper-large-v3-turbo` to `whisper-large-v3` for better transcription accuracy
- Media auto-reply updated to mention audio is now supported ("texto ou áudio" instead of only "texto")
- Audio messages no longer blocked by guards — they pass through with `requiresAudioTranscription` flag
- LLM extraction prompts (CPF/CNPJ, phone, email) enhanced with spoken number/email examples and normalized text hints

### Fixed
- LLM no longer incorrectly tells users it can't hear them — unknown flow prompt now confirms audio/voice message support
- Groq `json_validate_failed` system errors (e.g. "max completion tokens reached") no longer leak to end users as SafetyOverrideError — they are now treated as regular LLM errors
- `detectConfirmation()` now handles audio transcriptions — regex fast-path with word-boundary matching, plus LLM fallback for ambiguous responses (e.g. "exatamente", "bora", "fechou"). Fixed in both generalSupport and digitalCertificate flows
- General support empty summary — LLM returning empty content no longer renders `**`; falls back to truncated user text

### Added (prior unreleased)
- Flow versioning — each `FlowDefinition` now carries `version` and `active` fields; registry is a flat array with module-load validation and env-driven rollback via `FLOW_VERSION_OVERRIDES`
- All flow files moved into `v1/` subdirectories (e.g. `flows/billing/v1/flow.ts`) to support side-by-side v2 development
- General support flow enhanced with LLM-powered problem summary, human handoff confirmation (sim/não), and protocol ID generation (`GS-YYYYMMDD-XXXX`) — replaces bare-bones stub that immediately escalated
- Billing flow with invoice status subroute — replaces "coming soon" stub with a functional flow that collects invoice/order number and returns mock payment status (paid, pending, or overdue)
- Invoice status lookup with mock data keyed on last digit of the invoice ID
- Retry tracking (max 3 attempts) with human handoff on repeated invalid input
- Conversational unknown flow — replaces static menu with a natural LLM chat loop that greets users and identifies intent through dialogue
- Seamless flow handoff — when intent is detected during the unknown conversation, the user enters the target flow in the same message cycle without repeating themselves
- Turn count awareness — LLM becomes more direct and mentions available services on later conversation turns
- Safety override handling — when a crisis message triggers Groq's `json_validate_failed` error with a compassionate response, the model-generated crisis text (CVV 188, SAMU 192) is forwarded to the user instead of a generic error

### Changed
- LLM model switched from `llama-3.3-70b-versatile` to `openai/gpt-oss-120b`
- Unknown flow now uses LLM text mode (`jsonMode: false`) for natural conversation instead of JSON-wrapped replies
- Rewrite CLAUDE.md from 451-line spec document to ~86-line lean system prompt — removed content that duplicates code/docs, corrected model name, documented jsonMode text-mode exception, unknown flow conversational behavior, topic-shift skip rule, and added "No PII in logs" as Rule 7

### Fixed
- Topic shift no longer triggers during the unknown flow conversation, preventing casual messages from being misrouted
- Handoff replies no longer show contradictory double messages (stale conversational reply + target flow reply)
- Crisis/self-harm messages no longer receive "dificuldades técnicas" generic error — they now receive the LLM's safety-generated crisis response

## [0.6.0] - 2026-02-12

### Added
- Digital certificate flow with 5 subroutes: purchase, renewal, support, requirements, and status
- Purchase subroute — multi-step data collection (person type, CPF/CNPJ, email, phone) with LLM extraction, validation, confirmation, and field correction
- Renewal subroute — collects previous order ID and email, generates protocol
- Support subroute — captures problem description and optional order ID, generates support ticket protocol
- Requirements subroute — displays required documents for PF and PJ, offers to start a purchase
- Status subroute — looks up order status by protocol number (mock implementation)
- Field validation for CPF, CNPJ, email, and phone (length checks, no check-digit math)
- Protocol ID generation (format `CD-YYYYMMDD-XXXX`)
- Retry tracking with max 3 attempts per field before human handoff

## [0.5.0] - 2026-02-12

### Added
- Flow execution engine with declarative step results and automatic state transitions
- Flow registry mapping flow IDs to definitions
- Subroute classification via LLM within active flows
- Stub flows for unknown, general support, digital certificate, and billing
- General support flow — two-step proof-of-concept (describe problem, confirm handoff)

### Changed
- Routing orchestrator now delegates to the flow engine instead of using static reply maps

## [0.4.0] - 2026-02-12

### Added
- Subroute router with configurable subroute definitions per flow
- Data extractors for person type, CPF/CNPJ, email, and phone using LLM with Zod validation
- LLM prompt templates in Portuguese with few-shot examples
- Groq LLM client with round-robin API key rotation and automatic retry on rate limits
- Global flow classifier with confidence-based routing (>= 0.80 accept, >= 0.60 clarify)
- Topic shift detector — rule-based keyword matching first, LLM fallback when inconclusive
- Routing orchestrator handling new sessions, active sessions, and topic shifts
- Webhook deferred processing via Next.js `after()` to avoid timeout risk

### Fixed
- Empty/whitespace-only text messages now silently ignored instead of being processed
- LLM failures surface correct error messages instead of being masked as low-confidence classifications
- Outbound message persistence errors now logged instead of silently swallowed

## [0.3.0] - 2026-02-12

### Added
- Webhook normalization with Zod schema for Evolution API v2 payloads
- Message guards: fromMe, group, media, sticker, empty text
- Auto-reply for non-text messages (images, audio, video, documents)
- Structured JSON logger with correlation IDs and configurable log levels
- Evolution API client for sending text messages
- Message deduplication via unique `message_id` constraint
- Session loading with automatic expiry detection

## [0.2.0] - 2026-02-12

### Added
- Database schema: `conversation_state` and `chat_messages` tables
- Session repository: load, upsert (with 30min TTL), and clear operations
- Message repository: deduplicated inbound insert, outbound insert, recent message loading
- Seed data for local development

## [0.1.0] - 2026-02-12

### Added
- Next.js 15 project with TypeScript and ESLint
- Health check endpoint (`GET /api/health`)
- Evolution webhook endpoint (`POST /api/webhook/evolution`)
- Supabase CLI configuration
- GitHub Actions CI/CD workflows (PR validation, staging deploy, production deploy)
- Multi-environment CI/CD with concurrency controls and manual dispatch triggers
