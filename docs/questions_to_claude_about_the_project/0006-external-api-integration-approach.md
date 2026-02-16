# External API Integration — Architecture Approach

## QUESTION: I will be using external APIs to manipulate data, like for example in the digital certificate flow I could use an external API get info from an order. What is the best approach to handle with it, I mean if my flows will use external APIs how should it be implemented?

Good question. Let me look at your current architecture to give you a grounded recommendation.

*Searched for 2 patterns, read 6 files*

Your codebase already has a clear pattern for this. Looking at the existing structure:

You already have two external API clients following the same convention:

- `src/lib/evolution/client.ts` — WhatsApp API (`sendText`, `getMediaBase64`)
- `src/lib/stt/client.ts` — Groq Speech-to-Text

The pattern is consistent: dedicated directory under `src/lib/`, with a `client.ts` + `index.ts` barrel export.

### Recommended approach

One directory per external service under `src/lib/`:

```
src/lib/
  evolution/        # ← already exists (WhatsApp)
  stt/              # ← already exists (Groq STT)
  certOrder/        # ← new: certificate order API
    client.ts       # fetch calls, error handling, types
    index.ts        # barrel re-export
```

The client module handles:

- Config from env vars (`process.env.CERT_API_BASE_URL`, etc.)
- `fetch` with `AbortSignal.timeout()`
- Error logging (no PII)
- Return typed results or throw

Step handlers call the client directly — you already do this implicitly with the mock in `digitalCertificate/v1/subroutes/status.ts:63`. The mock `getMockOrderStatus()` would just be replaced by a real client call:

```ts
// subroutes/status.ts
import { getOrderStatus } from "@/lib/certOrder";

// inside the step handler:
const result = await getOrderStatus(text, ctx.correlationId);
```

The engine already handles errors for you — `engine.ts:162-184` catches exceptions from step handlers and returns the technical error reply. So if an API call throws, the user gets a graceful fallback without extra work.

### Key points

1. **Don't add an abstraction layer** (no generic "API service" class). Each external API is different enough that a thin, typed client per service is simpler and easier to maintain.
2. **Keep the API client stateless** — just exported async functions, config from env vars. Same as your `evolution` and `stt` clients.
3. **Call API clients from step handlers** — step handlers are already async and error-handled by the engine. This follows your rule "LLM never triggers side-effects; code decides."
4. **For slow APIs**, consider that your current webhook is synchronous (respond → reply). If an API takes 5+ seconds, you may want to send a "looking this up..." message before the API call using `sendText` directly from the step handler, then return the actual result as the reply.

In short: follow the exact pattern you already have with `evolution/` and `stt/`. It's working well — no need to invent anything new.
