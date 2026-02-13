## Phase 5 — Flow Framework + Deterministic Step Machine

### Context

Phases 1-4.5 built the complete webhook pipeline: payload normalization, guards, deduplication, session management, LLM global routing, topic shift detection, subroute classification, and data extractors. However, the pipeline currently sends static placeholder replies after routing (see `routeMessage.ts:79-81` comment: `// Phase 5 will replace this with step execution`).

Phase 5 builds the flow framework that replaces those placeholders with deterministic multi-turn step machines. The LLM classifies/extracts; code decides the next step.

**Exit criteria:** One flow can run multi-turn without LLM "driving" steps.

---

### Files to Create

```
src/lib/flows/
  types.ts                       ← Core interfaces
  engine.ts                      ← Flow execution engine
  registry.ts                    ← Flow handler registry
  index.ts                       ← Barrel exports
  unknown/
    flow.ts                      ← Unknown flow definition
    steps.ts                     ← Menu step
  generalSupport/
    flow.ts                      ← General support definition
    steps.ts                     ← Multi-turn steps (ask_problem → confirm_handoff)
  digitalCertificate/
    flow.ts                      ← Stub definition (Phase 6 fills in subroutes)
    steps.ts                     ← Placeholder step
  billing/
    flow.ts                      ← Stub definition (Phase 9 fills in subroutes)
    steps.ts                     ← Placeholder step
```

### File to Modify

- **src/lib/routing/routeMessage.ts** — Replace all 3 static-reply scenarios with `executeFlow()` calls

---

### Step 1: Core Types (`src/lib/flows/types.ts`)

```typescript
export interface FlowContext {
  state: SessionState;          // Current session (always populated)
  message: NormalizedMessage;   // Current inbound message
  chatHistory: ChatMessage[];   // Last 5 messages for LLM context
  correlationId: string;
}

export interface StepResult {
  reply: string;                // Text to send to user
  nextStep: string;             // Step to transition to
  data?: Record<string, unknown>; // Partial data merged into session.data
  done?: boolean;               // If true → clearSession after reply
}

export type StepHandler = (ctx: FlowContext) => Promise<StepResult>;

export interface SubrouteDefinition {
  entryStep: string;            // First step when entering this subroute
  steps: Record<string, StepHandler>;
}

export interface FlowDefinition {
  id: string;
  steps: Record<string, StepHandler>;  // Top-level steps (or sole steps for simple flows)
  subroutes?: Record<string, SubrouteDefinition>;  // Optional subroute step maps
}

export interface FlowExecutionResult {
  reply: string;
  nextState: {
    activeFlow: string | null;
    activeSubroute: string | null;
    step: string;
    data: Record<string, unknown>;
  };
  done: boolean;
}
```

**Key decisions:**

- `StepResult.data` is a partial merge — step handlers only declare fields they're updating, engine merges with existing `state.data`
- Steps cannot change `activeFlow` or `activeSubroute` — only the engine/router handles that
- `done: true` signals the engine to clear the session after sending the reply
- Subroute presence checked via `flow.subroutes && Object.keys(flow.subroutes).length > 0` — no separate boolean flag

---

### Step 2: Flow Engine (`src/lib/flows/engine.ts`)

Core function: `executeFlow(ctx: FlowContext): Promise<FlowExecutionResult>`

**Algorithm:**

1. Look up `FlowDefinition` from registry using `state.activeFlow`
   - Not found → log error, return technical-difficulties reply, `done: true`
2. Subroute selection (only if flow has populated subroutes AND `state.activeSubroute` is null):
   - Call `classifySubroute({ text, flow, chatHistory, correlationId })` from `@/lib/llm`
   - If `ok && confidence >= CONFIDENCE_ACCEPT` and subroute exists in flow definition:
     - Get the subroute's `entryStep`
     - Execute that step handler immediately (using updated context with new subroute/step)
     - Return result with `activeSubroute` set
   - If low confidence or error:
     - Return clarifying message, keep `step: "start"`, `activeSubroute: null`
3. Resolve step handler:
   - If `activeSubroute` → look in `flow.subroutes[activeSubroute].steps[step]`
   - Else → look in `flow.steps[step]`
   - Not found → log error, return "vamos recomeçar", `done: true`
4. Execute handler (wrapped in try/catch):
   - On success → construct `FlowExecutionResult` from `StepResult`:
     - `activeFlow` = current flow (or `null` if done)
     - `activeSubroute` = current subroute (unchanged)
     - `step` = `stepResult.nextStep`
     - `data` = `{ ...state.data, ...stepResult.data }`
     - `done` = `stepResult.done ?? false`
   - On exception → log error, return generic error reply, preserve current state
5. Log step transition: `event: "step_executed"`, `from_step`, `to_step`, `done`

---

### Step 3: Flow Registry (`src/lib/flows/registry.ts`)

Simple map of `FlowType` → `FlowDefinition`:

```typescript
const FLOW_REGISTRY: Record<string, FlowDefinition> = {
  unknown: unknownFlow,
  general_support: generalSupportFlow,
  digital_certificate: digitalCertificateFlow,
  billing: billingFlow,
};

export function getFlowDefinition(flowId: string): FlowDefinition | null
```

---

### Step 4: Unknown Flow (simple, 1 step)

**`unknown/steps.ts`** — `handleStart`:

- Shows a menu: "Como posso te ajudar? Certificado Digital / Faturamento / Suporte Geral"
- Returns `done: true` — session is cleared so the next message triggers global routing afresh

**`unknown/flow.ts`:**

```typescript
{ id: "unknown", steps: { start: handleStart }, subroutes: undefined }
```

---

### Step 5: General Support Flow (multi-turn proof, 2 steps)

This is the exit-criteria proof: two deterministic turns without LLM driving steps.

**`generalSupport/steps.ts`:**

1. **`handleStart`** (step: `"start"`):
   - Reply: "Entendi que você precisa de suporte. Pode me descrever qual é o problema?"
   - `nextStep: "awaiting_problem"`
2. **`handleAwaitingProblem`** (step: `"awaiting_problem"`):
   - Captures `message.text` as the problem description
   - Reply: "Obrigado por explicar! [problem summary]. Vou encaminhar para um atendente."
   - `data: { problem: message.text, handoff_at: timestamp }`
   - `done: true`

**`generalSupport/flow.ts`:**

```typescript
{ id: "general_support", steps: { start: handleStart, awaiting_problem: handleAwaitingProblem } }
```

---

### Step 6: Stub Flows (`digital_certificate`, `billing`)

Both follow the same pattern — a single `start` step that returns the current placeholder message and `done: true`. This keeps current behavior unchanged while the framework is in place.

**Key detail:** These stubs have empty subroutes (`subroutes` is `undefined` or `{}`), so the engine skips subroute classification. When Phase 6/9 adds subroute definitions, the engine will automatically start classifying.

---

### Step 7: Barrel Export (`src/lib/flows/index.ts`)

Exports: `executeFlow`, `getFlowDefinition`, and all types.

---

### Step 8: Integrate with `routeMessage.ts`

#### New imports

```typescript
import { executeFlow, type FlowContext, type FlowExecutionResult } from "@/lib/flows";
import { clearSession } from "@/lib/db";  // already partially imported
```

#### Remove

- `FLOW_REPLIES` constant (replaced by flow handlers)
- `TOPIC_SWITCH_PREFIX` constant
- `CLARIFY_REPLY` constant

#### Keep

- `ERROR_REPLY` (used for LLM service errors before flow execution)
- `JSON_FALLBACK_REPLY` (used for classification parse errors)

#### New variables after line 52

```typescript
let nextState: FlowExecutionResult["nextState"];
let done = false;
```

#### Scenario 1: Existing session, no topic shift (lines 77-89)

Replace static reply with:

```typescript
flow = session.activeFlow as FlowType;
const flowResult = await executeFlow({
  state: session,
  message,
  chatHistory,
  correlationId,
});
reply = flowResult.reply;
nextState = flowResult.nextState;
done = flowResult.done;
```

#### Scenario 2: Existing session, topic shift (lines 64-76)

Replace static reply with:

```typescript
flow = shift.flow;
const flowResult = await executeFlow({
  state: { ...session, activeFlow: flow, activeSubroute: null, step: "start", data: {} },
  message,
  chatHistory,
  correlationId,
});
reply = "Entendi, vamos mudar de assunto. " + flowResult.reply;
nextState = flowResult.nextState;
done = flowResult.done;
```

#### Scenario 3: New/expired session (lines 137-156)

After determining flow from confidence thresholds, replace static reply with:

```typescript
const flowResult = await executeFlow({
  state: {
    userId: message.userId,
    instance: message.instanceName,
    activeFlow: flow,
    activeSubroute: null,
    step: "start",
    data: {},
    updatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  },
  message,
  chatHistory,
  correlationId,
});
reply = flowResult.reply;
nextState = flowResult.nextState;
done = flowResult.done;
```

#### Session persistence (lines 158-166)

Replace current upsert with:

```typescript
if (done) {
  await clearSession(message.userId);
} else {
  await upsertSession({
    userId: message.userId,
    instance: message.instanceName,
    activeFlow: nextState.activeFlow,
    activeSubroute: nextState.activeSubroute,
    step: nextState.step,
    data: nextState.data,
  });
}
```

---

### Implementation Order

1. `src/lib/flows/types.ts` — types first, everything depends on them
2. `src/lib/flows/unknown/steps.ts` + `flow.ts` — simplest flow
3. `src/lib/flows/generalSupport/steps.ts` + `flow.ts` — multi-turn proof
4. `src/lib/flows/digitalCertificate/steps.ts` + `flow.ts` — stub
5. `src/lib/flows/billing/steps.ts` + `flow.ts` — stub
6. `src/lib/flows/registry.ts` — registers all 4 flows
7. `src/lib/flows/engine.ts` — core engine (depends on registry + types)
8. `src/lib/flows/index.ts` — barrel export
9. `src/lib/routing/routeMessage.ts` — integration (last, depends on everything above)
10. Delete `src/lib/flows/.gitkeep`

---

### Verification

1. **TypeScript compilation:** `npx tsc --noEmit` must pass
2. **Build:** `npm run build` must succeed
3. **Manual test — unknown flow:** Send "Oi" → expect menu → session cleared
4. **Manual test — general_support multi-turn:** Send "Preciso de ajuda" → expect "descreva o problema" → send problem → expect handoff confirmation → session cleared
5. **Manual test — stub flows:** Send "Quero certificado digital" → expect placeholder → session cleared
6. **Manual test — topic shift:** Start in `general_support` → send "Quero certificado" → expect topic switch + `digital_certificate` placeholder
