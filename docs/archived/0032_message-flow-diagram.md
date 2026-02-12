# Message Flow Diagram

## Full Message Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Evolution API Webhook                            │
│                   POST /api/webhook/evolution                       │
└─────────────────────┬───────────────────────────────────────────────┘
                      │
                      ▼
              ┌───────────────┐
              │  normalizeMessage()  │
              │  (normalize.ts)      │
              └───────┬───────┘
                      │
                      ▼
              ┌───────────────┐
              │  applyGuards()      │
              └───────┬───────┘
                      │
           ┌──────────┼──────────┬──────────┬─────────┐
           ▼          ▼          ▼          ▼         ▼
        fromMe?    group?    media?    sticker?    empty?
        → skip     → skip   → auto-   → skip     → skip
                              reply
                      │
                      ▼ (text message, not fromMe, not group)
              ┌───────────────┐
              │  dedupe by     │
              │  message_id    │
              └───────┬───────┘
                      │ (new message)
                      ▼
              ┌───────────────┐
              │  rate limiter  │
              └───────┬───────┘
                      │
                      ▼
              ┌───────────────┐
              │  load session  │
              │  + chat history│
              └───────┬───────┘
                      │
          ┌───────────┴────────────┐
          ▼                        ▼
   Has active session?        No session
          │                   (new/expired)
          │                        │
          ▼                        ▼
  ┌─────────────────┐     ┌─────────────────┐
  │ activeFlow       │     │ classifyFlow()   │
  │ === "unknown"?   │     │ (LLM)           │
  └──┬──────────┬───┘     └───────┬─────────┘
     │          │                  │
   Yes          No          ┌─────┴──────┐
     │          │           ▼            ▼
     │          ▼       conf≥0.80    conf<0.80
     │   ┌────────────┐     │            │
     │   │detectTopic │     ▼            ▼
     │   │Shift (LLM) │  route to    route to
     │   └──┬──────┬──┘  that flow   "unknown"
     │      │      │         │            │
     │   shift?  no shift    └─────┬──────┘
     │      │      │               │
     │      ▼      ▼               ▼
     │   switch  continue    ┌───────────┐
     │   flow    current     │executeFlow│
     │      │    flow        │(start)    │
     │      │      │         └─────┬─────┘
     │      ▼      ▼               │
     │   ┌───────────┐             │
     │   │executeFlow│             │
     │   └─────┬─────┘             │
     │         │                   │
     ▼         ▼                   ▼
  ┌──────────────────────────────────────┐
  │          executeFlow()               │
  │          (engine.ts)                 │
  │                                      │
  │  1. Lookup flow in registry          │
  │  2. If flow has subroutes            │
  │     & no active subroute:            │
  │     → classifySubroute() (LLM)      │
  │  3. Resolve step handler             │
  │  4. Execute step handler             │
  │     → returns StepResult             │
  └──────────────┬───────────────────────┘
                 │
                 ▼
        ┌─────────────────┐
        │ _handoff_flow    │
        │ in result data?  │
        └──┬───────────┬──┘
           │           │
          Yes          No
           │           │
           ▼           │
   ┌──────────────┐    │
   │executeFlow() │    │
   │with target   │    │
   │flow at start │    │
   │              │    │
   │reply =       │    │
   │target flow's │    │
   │reply only    │    │
   └──────┬───────┘    │
          │            │
          ▼            ▼
  ┌──────────────────────────┐
  │      done?               │
  │                          │
  │  Yes → clearSession()   │
  │  No  → upsertSession()  │
  │        (TTL = 30min)     │
  └────────────┬─────────────┘
               │
               ▼
  ┌──────────────────────────┐
  │  sendText()              │
  │  (Evolution API)         │
  └────────────┬─────────────┘
               │
               ▼
  ┌──────────────────────────┐
  │  insertOutbound()        │
  │  (chat_messages)         │
  └──────────────────────────┘
```

## Unknown Flow Detail (inside executeFlow)

```
  ┌──────────────────────────────────────────┐
  │          Unknown Flow Steps              │
  │                                          │
  │  start / awaiting_reply                  │
  │  ┌────────────────────────────────┐      │
  │  │ 1. getConversationalReply()   │      │
  │  │    (LLM → {"reply": "..."})   │      │
  │  │    fails? → STATIC_MENU, done │      │
  │  │                                │      │
  │  │ 2. classifyFlow() (LLM)       │      │
  │  │    non-unknown ≥ 0.80?         │      │
  │  │    → _handoff_flow             │      │
  │  │                                │      │
  │  │ 3. turn ≥ 5?                   │      │
  │  │    → STATIC_MENU, done         │      │
  │  │                                │      │
  │  │ 4. else → reply naturally,     │      │
  │  │    stay on awaiting_reply      │      │
  │  └────────────────────────────────┘      │
  └──────────────────────────────────────────┘
```
