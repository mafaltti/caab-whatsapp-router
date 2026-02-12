# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Conversational unknown flow — replaces static menu with a natural LLM chat loop that greets users and identifies intent through dialogue
- Seamless flow handoff — when intent is detected during the unknown conversation, the user enters the target flow in the same message cycle without repeating themselves
- Turn count awareness — LLM becomes more direct and mentions available services on later conversation turns

### Changed
- LLM model switched from `llama-3.3-70b-versatile` to `openai/gpt-oss-120b`

### Fixed
- Topic shift no longer triggers during the unknown flow conversation, preventing casual messages from being misrouted
- Handoff replies no longer show contradictory double messages (stale conversational reply + target flow reply)

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
