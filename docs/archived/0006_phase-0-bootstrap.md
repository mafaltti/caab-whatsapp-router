# Phase 0 — Bootstrap Next.js + TypeScript Project

## Context

The project currently has comprehensive documentation (`CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/ENVIRONMENT.md`, `docs/PLAN.md`, `docs/FLOWS.md`), GitHub Actions workflows (`.github/workflows/ci.yml`, `staging.yml`, `production.yml`), and a `.gitignore` — but no source code, no `package.json`, and no project scaffolding.

This phase creates the foundational Next.js + TypeScript project structure that all subsequent phases will build upon.

---

## Step 1: Scaffold Next.js into the existing repository

Run `create-next-app` in the project root. Since the directory is non-empty (docs, `.github`, etc.), use a temp-directory approach:

```bash
# Create Next.js in a temp directory, then merge into project root
npx create-next-app@latest temp-next-app \
  --typescript \
  --app \
  --src-dir \
  --no-tailwind \
  --eslint \
  --use-npm \
  --no-git
```

**Options rationale:**

| Flag | Reason |
|---|---|
| `--typescript` | Required by project spec |
| `--app` | App Router (specified in `ARCHITECTURE.md`) |
| `--src-dir` | `src/` directory structure (specified in `CLAUDE.md` project structure) |
| `--no-tailwind` | Not needed (backend webhook service, no frontend UI) |
| `--eslint` | Linting required by CI pipeline (`ci.yml` runs `npm run lint`) |
| `--use-npm` | CI uses `npm ci` (`ci.yml:34`) |
| `--no-git` | Git already initialized |

Then copy scaffolded files into the project root (`package.json`, `tsconfig.json`, `next.config.ts`, `src/`, `public/`, eslint config) and remove the temp directory.

**Files created:** `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `src/app/layout.tsx`, `src/app/page.tsx`, `public/`

---

## Step 2: Install project-specific dependencies

Per `PLAN.md` and `CLAUDE.md`:

```bash
npm install @supabase/supabase-js zod groq-sdk
npm install -D @types/node
```

**Modified file:** `package.json` (dependencies added)

---

## Step 3: Create the full directory structure

Create all directories specified in `CLAUDE.md` project structure (empty directories with `.gitkeep` or placeholder `index.ts` files):

```
src/
  app/
    api/
      health/route.ts              ← Step 4
      webhook/evolution/route.ts   ← Step 5
    layout.tsx                     ← already from create-next-app
    page.tsx                       ← already from create-next-app
  lib/
    webhook/                       (empty, for Phase 2)
    db/                            (empty, for Phase 1)
    evolution/                     (empty, for Phase 7)
    llm/                           (empty, for Phase 4.5)
    flows/                         (empty, for Phase 5-6)
    shared/                        (empty, for shared utilities)
```

Create placeholder `index.ts` barrel files in each `lib/` subdirectory so the structure exists in git and imports are ready.

---

## Step 4: Create health check endpoint

**File:** `src/app/api/health/route.ts`

```typescript
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
}
```

This is an exit criterion: `GET /api/health` must return `{"status":"ok","timestamp":"..."}`.

---

## Step 5: Create webhook endpoint stub

**File:** `src/app/api/webhook/evolution/route.ts`

Minimal stub that accepts POST and returns 200 OK — full implementation comes in Phase 2.

```typescript
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  // TODO: Phase 2 — implement normalization, guards, dedupe, processing
  return NextResponse.json({ ok: true });
}
```

---

## Step 6: Create `.env.example`

**File:** `.env.example` (at project root)

Template with all required variables from `CLAUDE.md` and `ENVIRONMENT.md`, without actual secrets:

```env
# Supabase
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Evolution API
EVOLUTION_BASE_URL=
EVOLUTION_API_KEY=
EVOLUTION_INSTANCE=

# Groq LLM (comma-separated keys for rotation)
GROQ_API_KEYS=

# Optional
WEBHOOK_SECRET=
LOG_LEVEL=info
NODE_ENV=development
```

---

## Step 7: Simplify `src/app/page.tsx`

Replace the default `create-next-app` homepage with a minimal status page (the project is a backend API, not a frontend app):

```tsx
export default function Home() {
  return (
    <main>
      <h1>WhatsApp Assistant Router</h1>
      <p>API is running. Use <code>/api/health</code> to check status.</p>
    </main>
  );
}
```

Also clean up any unnecessary CSS/fonts from `create-next-app` defaults (remove `globals.css` content beyond basic resets, remove any font imports).

---

## Step 8: Initialize Supabase

```bash
supabase init
```

This creates `supabase/config.toml` in the project root. No migrations yet (that's Phase 1).

> **Note:** This step requires Supabase CLI installed (`npm install -g supabase`). If Docker Desktop is not running, `supabase init` still works — it only creates config files. `supabase start` (which needs Docker) is NOT required for this phase but is an exit criterion to verify.

---

## Step 9: Verify everything works

Run these checks:

| # | Command | Expected Result |
|---|---|---|
| 1 | `npm run dev` | Next.js starts on `http://localhost:3000` |
| 2 | `curl http://localhost:3000/api/health` | Returns `{"status":"ok","timestamp":"..."}` |
| 3 | `npx tsc --noEmit` | TypeScript compiles without errors |
| 4 | `npm run lint` | ESLint passes |
| 5 | `supabase start` | Local Supabase starts (requires Docker Desktop running) |
| 6 | Open `http://localhost:54323` | Supabase Studio accessible |

---

## Files Summary

| Action | File |
|---|---|
| Create | `package.json` (via create-next-app + npm install) |
| Create | `tsconfig.json` (via create-next-app) |
| Create | `next.config.ts` (via create-next-app) |
| Create | `eslint.config.mjs` (via create-next-app) |
| Create | `src/app/layout.tsx` (via create-next-app, then simplify) |
| Create | `src/app/page.tsx` (simplify to status page) |
| Create | `src/app/api/health/route.ts` |
| Create | `src/app/api/webhook/evolution/route.ts` (stub) |
| Create | `src/lib/webhook/.gitkeep` |
| Create | `src/lib/db/.gitkeep` |
| Create | `src/lib/evolution/.gitkeep` |
| Create | `src/lib/llm/.gitkeep` |
| Create | `src/lib/flows/.gitkeep` |
| Create | `src/lib/shared/.gitkeep` |
| Create | `.env.example` |
| Create | `supabase/config.toml` (via supabase init) |
| Existing | `.gitignore` (no changes needed) |
| Existing | `.github/workflows/*` (no changes needed) |

---

## Exit Criteria (from PLAN.md)

- `npm run dev` starts Next.js on `http://localhost:3000`
- `supabase start` runs local Supabase successfully
- Local Studio accessible at `http://localhost:54323`
- `GET /api/health` returns `{"status":"ok","timestamp":"..."}`
- TypeScript compiles without errors (`npx tsc --noEmit`)
- ESLint passes (`npm run lint`)
