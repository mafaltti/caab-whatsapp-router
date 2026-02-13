# CLAUDE.md Rewrite Summary

Done. `CLAUDE.md` has been rewritten from 451 lines to 86 lines. Here's what changed:

## Removed (all safely lives in code or `docs/`)

- Full DB schema, Zod code examples, LLM prompt templates, key rotation snippet, project structure tree, env vars list, message type handling table, error handling specs, rate limiting specs, group message handling, session expiry details, observability/monitoring specs, step machine contract, acceptance tests, CI/CD details

## Corrected

- **Model:** `llama-3.3-70b-versatile` → `openai/gpt-oss-120b`
- **Rule 4:** notes `jsonMode: false` exception for conversational replies
- **Unknown flow:** described as conversational LLM + `_handoff_flow` handoff (not static menu)
- **Topic shift:** explicitly noted as skipped in unknown flow
- **Rate limiting:** marked as "not yet implemented"

## Added

- **Rule 7:** No PII in logs
- **Zod import note:** `from "zod/v4"` (not `from "zod"`)
- **"Adding a Flow" checklist**
- **References section** pointing to `docs/`
