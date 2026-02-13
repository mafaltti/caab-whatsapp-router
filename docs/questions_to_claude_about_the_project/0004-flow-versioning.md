# Flow Versioning

## QUESTION: Is there anyway I could version flows so I could keep for example "Digital Certificate" (active) and "Digital Certificate (OLD)" (inactive). Just a question, I dont want you implement this.

● Yes, a few approaches that would fit the current architecture:

### 1. Registry metadata (simplest)

Add `version` and `active` to `FlowDefinition`. The registry only exposes active flows. Old versions stay in the codebase but aren't registered.

```
flows/
  digitalCertificate/
    v1/flow.ts    ← active: false
    v2/flow.ts    ← active: true
```

### 2. Alias pointer

Registry maps a stable ID (`digital_certificate`) to whichever version is current. Old versions live under versioned IDs (`digital_certificate_v1`) but the LLM prompts and router only know about the stable ID.

### 3. Feature flag / env-driven

An env var or DB config decides which version is active. Useful if you want to A/B test or roll back without redeploying:

```
FLOW_DIGITAL_CERTIFICATE_VERSION=v2
```

### 4. Git-only (no code change)

Just keep old flow code in a `flows/archived/` folder, never imported. It's version-controlled via git history. Simplest but no runtime switching.

---

## Recommendation

**Option 1** — it's minimal, keeps old code readable in the repo, and the registry already acts as the single source of truth. You'd just add an `active` boolean and a `version` string to `FlowDefinition`, and have `getFlowDefinition()` skip inactive flows. No infra changes needed.

> Want me to create a GitHub issue to track this?
