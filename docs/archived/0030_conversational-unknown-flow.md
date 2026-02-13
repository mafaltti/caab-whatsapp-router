# Conversational Unknown Flow (Free-form LLM Chat)

## Context

Currently, when a user sends "Oi" or an ambiguous message, the global router classifies it as `unknown`, and the unknown flow shows a static numbered menu then immediately ends the session (`done: true`). This feels robotic. The goal is to replace it with a **free-form LLM conversational loop** that naturally greets the user, understands what they need through dialogue, and seamlessly hands off to the correct flow once intent is clear.

## Design

### Conversation Loop

1. **`start` step:** User's message was classified as unknown. Call the LLM with a conversational prompt. Also run `classifyFlow()` on the same message — if a non-unknown flow is detected (≥ 0.80), hand off immediately. Otherwise, reply naturally and stay on `awaiting_reply`.
2. **`awaiting_reply` step:** Each follow-up message goes through the same dual call (conversational LLM + `classifyFlow()`). If intent is detected → hand off to that flow. Otherwise → continue chatting.
3. **Max turns fallback:** After 5 turns without resolving, show the static menu and end the session. Prevents infinite loops and excessive LLM cost.

### Flow Transition: `_handoff_flow` Convention

`StepResult` cannot change `activeFlow` — only the routing orchestrator can. So when the unknown flow detects an intent, it stores `_handoff_flow` in the step result data. The orchestrator checks for this after `executeFlow()` returns, and re-executes with the target flow — so the user seamlessly enters the new flow in the same message cycle (no need to repeat themselves).

### LLM Cost

- 2 LLM calls per turn (1 conversational + 1 `classifyFlow`)
- Most users resolve in 1–2 messages → 2–4 LLM calls total
- Hard cap at 5 turns = max 10 LLM calls

---

## File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/llm/prompts.ts` | MODIFY | Add `unknownConversationSystemPrompt()` and `unknownConversationUserPrompt()` |
| `src/lib/flows/unknown/steps.ts` | MODIFY | Replace static menu with `handleStart` + `handleAwaitingReply` conversational steps |
| `src/lib/flows/unknown/flow.ts` | MODIFY | Register `awaiting_reply` step |
| `src/lib/routing/routeMessage.ts` | MODIFY | Handle `_handoff_flow` convention after `executeFlow()` |

---

## Implementation Steps

### Step 1 — Add Conversational Prompt to `prompts.ts`

Add two functions:

**`unknownConversationSystemPrompt()`** — Portuguese system prompt instructing the LLM to:

- Act as a friendly WhatsApp assistant for a digital certificate company (CAAB)
- Know available services: certificado digital, faturamento, suporte geral
- Greet naturally and try to understand the user's need
- Keep replies short (1–3 sentences, WhatsApp style)
- Never mention being an AI
- Guide toward identifying the user's need without showing a menu

**`unknownConversationUserPrompt(text, chatHistory)`** — Chat history + current message.

### Step 2 — Rewrite `steps.ts`

**`handleStart`:**

- Call LLM with conversational prompt (`try/catch` — on failure, fall back to static menu + `done: true`)
- Call `classifyFlow()` on the user's message
- If `classifyFlow` returns non-unknown flow at ≥ 0.80 → return `{ reply: llmReply, nextStep: "start", data: { _handoff_flow: flow }, done: false }`
- Otherwise → return `{ reply: llmReply, nextStep: "awaiting_reply", data: { _turn_count: 1 } }`

**`handleAwaitingReply`:**

- Same dual-call logic
- If flow detected → return with `_handoff_flow`
- If `_turn_count >= 5` → return static menu + `done: true`
- Otherwise → return `{ reply: llmReply, nextStep: "awaiting_reply", data: { _turn_count: count + 1 } }`

### Step 3 — Update `flow.ts`

Add `awaiting_reply: handleAwaitingReply` to the steps map.

### Step 4 — Handle `_handoff_flow` in `routeMessage.ts`

After the `executeFlow()` call in all 3 branches (continue flow, topic shift, new session), add a check:

```typescript
if (nextState.data._handoff_flow) {
  const handoffFlow = nextState.data._handoff_flow as string;
  const handoffResult = await executeFlow({
    state: {
      ...sessionLikeObject,
      activeFlow: handoffFlow,
      activeSubroute: null,
      step: "start",
      data: {},
    },
    message,
    chatHistory,
    correlationId,
  });
  reply = reply + "\n\n" + handoffResult.reply;
  nextState = handoffResult.nextState;
  done = handoffResult.done;
}
```

This is ~15 lines added once, right before the session persistence block.

---

## Verification

1. `npm run build` — no TypeScript errors
2. `npm run lint` — no warnings
3. **Manual test:** "Oi" → natural greeting → "preciso de certificado" → seamlessly enters `digital_certificate` flow
4. **Manual test:** send 5 vague messages → falls back to static menu
5. **Manual test:** "Quero comprar certificado digital" as first message → global router classifies as `digital_certificate` directly (unknown flow not involved — existing behavior preserved)
6. **Manual test:** LLM error → falls back to static menu immediately
