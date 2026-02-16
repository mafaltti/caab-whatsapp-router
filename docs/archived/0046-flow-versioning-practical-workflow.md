# Flow Versioning — Practical Workflow

## QUESTION: So I guess for this use case, for example, it would be suitable to clone/duplicate "digital_certificate" flow, work in the clone and activate it. How would I do it in practical terms? Duplicating flow directory (Ctrl+C / Ctrl+V) and renaming it?

Exactly. The practical workflow would be:

### Step 1: Restructure (one-time, during implementation)

The current flat structure becomes versioned:

```
flows/digitalCertificate/
  flow.ts              ←  today (flat)
  steps.ts
  helpers.ts
  validation.ts
  subroutes/
```

Becomes:

```
flows/digitalCertificate/
  v1/                  ←  move everything into v1/
    flow.ts            (version: "v1", active: true)
    steps.ts
    helpers.ts
    validation.ts
    subroutes/
```

### Step 2: Create v2 (when you need it)

Copy the entire `v1/` folder to `v2/`:

```
flows/digitalCertificate/
  v1/
    flow.ts            (version: "v1", active: false)  ← flip to false
    ...
  v2/
    flow.ts            (version: "v2", active: true)   ← flip to true
    ...
```

Then work freely inside `v2/` — rename steps, rewrite subroutes, change extraction logic. The `v1/` folder is untouched.

### Step 3: Register v2

In `registry.ts`, import and add both:

```typescript
import { digitalCertificateFlowV1 } from "./digitalCertificate/v1/flow";
import { digitalCertificateFlowV2 } from "./digitalCertificate/v2/flow";

const FLOW_REGISTRY: FlowDefinition[] = [
  digitalCertificateFlowV1,  // active: false
  digitalCertificateFlowV2,  // active: true
  // ... other flows
];
```

`getFlowDefinition("digital_certificate")` automatically returns v2 because it's the active one.

### Step 4: Deploy and monitor

If v2 breaks in production:

```
FLOW_VERSION_OVERRIDES=digital_certificate=v1
```

Redeploy — back to v1 in seconds. Fix v2 at your own pace.

### What You DON'T Need to Touch

- No DB changes
- No LLM prompt changes
- No `FLOW_VALUES` changes
- No routing changes
- Sessions still store `active_flow: "digital_certificate"` — the registry resolves which version

So yes — it's literally duplicate the folder, update the version/active flags, register the new import, and start working. The flow ID stays the same, which is what keeps everything else in the system working transparently.

---

## QUESTION: It would be possible to create v1.1, v1.2, v2, v3 and so forth?

Yes, the `version` field is a free-form string, so you can use any versioning scheme you want:

```typescript
// v1 variants (incremental improvements)
{ id: "digital_certificate", version: "v1",   active: false }
{ id: "digital_certificate", version: "v1.1", active: false }
{ id: "digital_certificate", version: "v1.2", active: false }

// v2 (major rewrite)
{ id: "digital_certificate", version: "v2",   active: true }

// v3 (next major)
{ id: "digital_certificate", version: "v3",   active: false }
```

The only rule: exactly one version per flow ID can be `active: true` at any time. The registry validation (Step 6 of the implementation plan) would enforce this at startup.

The directory structure follows naturally:

```
flows/digitalCertificate/
  v1/
  v1.1/
  v1.2/
  v2/       ← active
  v3/
```

And the env override works with any version string:

```
FLOW_VERSION_OVERRIDES=digital_certificate=v1.2
```

That said, I'd suggest keeping the scheme simple — semver-style (`v1`, `v1.1`) or just sequential (`v1`, `v2`, `v3`). Too many patch versions living in the codebase simultaneously could become clutter. Old versions you'll never roll back to can always be deleted since Git history preserves them.
