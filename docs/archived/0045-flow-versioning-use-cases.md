# Flow Versioning — Practical Use Cases

Based on the team's analysis of the codebase, here are practical use cases for flow versioning:

## Immediate Use Cases

1. **Flow rewrite with safety net** — Rewrite `digital_certificate` (the most complex flow with 16 step handlers and 5 subroutes) as v2 while keeping v1 intact. If v2 has issues in production, flip `FLOW_VERSION_OVERRIDES=digital_certificate=v1` and redeploy instantly.

2. **Incremental flow migration** — Refactor a flow's step structure (rename steps, merge subroutes, change data schema) without worrying about breaking in-flight sessions. Deploy v2 as active, let v1 sessions expire naturally over 30 minutes.

3. **LLM prompt experimentation** — Different flow versions can have different step handlers that use different LLM prompts/extraction strategies. Test whether a reworded prompt in billing v2 improves subroute classification accuracy vs v1.

## Medium-Term Use Cases

4. **A/B testing flow designs** — Route a percentage of new sessions to v2 (e.g., a simplified `digital_certificate` flow with fewer steps) and compare completion rates, drop-off points, and handoff frequency against v1.

5. **Gradual rollout** — Deploy a new flow version as inactive, activate it for internal test numbers first (via env override or custom logic), then promote to active for all users.

6. **Seasonal/campaign flows** — Activate a temporary version of `billing` during invoice season with extra payment-related subroutes, then deactivate it and revert to the standard version.

## Future / Advanced Use Cases

7. **Per-instance versioning** — Different Evolution API instances (different WhatsApp numbers/departments) could run different flow versions. A sales line runs `general_support` v2 with product-focused steps, while the support line runs v1.

8. **Compliance snapshots** — Keep the exact flow logic that was active during a regulatory audit period. If questions arise later, you can point to `digital_certificate` v3 as the exact version that was running.

9. **Flow deprecation** — Gradually sunset a flow by marking it inactive instead of deleting it. The code stays compilable and testable in the repo, ready to reactivate if needed.

10. **Multi-developer parallel work** — Two developers can work on competing v2 and v3 implementations of the same flow simultaneously, each in their own version subfolder, without merge conflicts on the same files.

## What Versioning Does NOT Solve

- **Runtime flow creation** — This is code-level versioning, not a no-code builder. New flows still require a deploy.
- **Per-user flow pinning** — Without additional routing logic, all users get the same active version. Per-user A/B testing would need a thin layer on top.
- **Subroute-level versioning** — The proposed design versions entire flows. You can't run subroute `purchase` v1 with subroute `renewal` v2 within the same flow.

---

The strongest immediate justification is use case #1 — the `digital_certificate` flow is complex enough (16 handlers, 5 subroutes) that any rewrite carries real risk, and having a one-line rollback via env var is a significant safety improvement.

## Why `digital_certificate` Is the Key Justification

The `digital_certificate` flow is by far the largest flow in the codebase. Comparing it to the others:

| Flow | Step Handlers | Subroutes |
|---|---|---|
| `unknown` | 2 | 0 |
| `general_support` | 3 | 0 |
| `billing` | 2 | 1 |
| `digital_certificate` | 16 | 5 (purchase, renewal, support, requirements, status) |

It has 8x more step handlers than the next largest flow. That means:

**The rewrite risk is real.** If you ever need to rewrite or significantly refactor `digital_certificate` — say, restructuring the purchase subroute (6 steps), changing data extraction logic, or renaming steps — you're touching 16 interconnected handlers. Any bug could break the most complex user journey in the system. Without versioning, you'd deploy and hope for the best.

**The rollback without versioning is painful.** If the rewrite breaks in production, your options today are:

- `git revert` the commit and redeploy (minutes of downtime, may have merge conflicts)
- Manually patch the broken handler while users are stuck mid-flow

With versioning + env override, rollback is one line:

```
FLOW_VERSION_OVERRIDES=digital_certificate=v1
```

Redeploy on Vercel picks it up in seconds. The registry sees the override, skips v2, returns v1. All new sessions use the old working version. In-flight v2 sessions expire naturally within 30 minutes thanks to the TTL.

That's the core point — the flow that's most likely to need a rewrite (because it's the most complex) is also the one where a failed rewrite would cause the most damage. Versioning turns that from a high-stakes deploy into a low-risk operation with an instant escape hatch.
