# Supabase Environment Alignment Plan

## Context

After comparing the project documentation against Supabase's official *Managing Environments* guide, 10 misalignments were identified. The Supabase guide recommends a 3-tier environment strategy (local, staging, production) with CI/CD automation, proper migration tooling, and TypeScript type generation — several of which are missing or incorrectly configured in our docs.

## Objective

Update all project documentation (`CLAUDE.md`, `PLAN.md`, `ENVIRONMENT.md`, `ARCHITECTURE.md`) to align with Supabase's recommended practices for managing environments.

---

## Alignment Analysis: Current State vs Supabase Guidelines

### 🔴 CRITICAL GAPS (Must Fix)

#### 1. Missing `supabase init` — Wrong folder structure

| | Details |
|---|---|
| **Supabase says** | Run `supabase init` to create a `supabase/` folder with `config.toml` and `migrations/` inside |
| **Our docs say** | Use `migrations/YYYYMMDD001_init.sql` at project root |
| **Impact** | CLI commands like `supabase db push`, `supabase db reset`, `supabase migration new` won't work with the wrong folder structure |
| **Fix** | Change `migrations/` → `supabase/migrations/`, add `supabase init` to Phase 0 |

#### 2. No local Supabase development (Docker)

| | Details |
|---|---|
| **Supabase says** | Use `supabase start` to run a full Supabase stack locally via Docker (Postgres, Auth, Storage, Studio at `localhost:54323`) |
| **Our docs say** | Connect directly to remote Supabase project for development |
| **Impact** | Risk of corrupting production/staging data during development, network latency, can't work offline |
| **Fix** | Add Docker as prerequisite, add `supabase start` to dev workflow, use local connection string for development |

#### 3. No multi-environment Supabase projects

| | Details |
|---|---|
| **Supabase says** | Create 3 separate Supabase projects: Local dev via `supabase start` (Docker), Staging linked to `develop` branch, Production linked to `main` branch |
| **Our docs say** | Only mention a single Supabase project with `.env.local` vs Vercel env vars |
| **Fix** | Document multi-project setup, add `SUPABASE_PROJECT_ID` per environment, update env vars |

#### 4. No CI/CD for database migrations

| | Details |
|---|---|
| **Supabase says** | Use GitHub Actions to auto-deploy migrations on branch merges: PR to `develop` → CI validates types, merge to `develop` → deploy to staging, merge to `main` → deploy to production |
| **Our docs say** | Manual `supabase db push` or paste SQL in dashboard |
| **Fix** | Add GitHub Actions workflow files, document CI/CD secrets |

#### 5. No TypeScript type generation

| | Details |
|---|---|
| **Supabase says** | Run `supabase gen types typescript --local` to generate types from schema, validate in CI that generated types are committed |
| **Our docs say** | Nothing about type generation |
| **Fix** | Add type generation step, add to CI validation |

### 🟡 MODERATE GAPS (Should Fix)

#### 6. Missing CI/CD secrets documentation

| | Details |
|---|---|
| **Supabase says** | Store these as GitHub encrypted secrets: `SUPABASE_ACCESS_TOKEN` (personal access token), `SUPABASE_DB_PASSWORD` (project database password), `SUPABASE_PROJECT_ID` (project reference ID per environment) |
| **Our docs say** | Only mention `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` |
| **Fix** | Add CI/CD secrets to `ENVIRONMENT.md` and `ARCHITECTURE.md` |

#### 7. No branching strategy mapped to Supabase environments

| | Details |
|---|---|
| **Supabase says** | Feature branches → `develop` → `main`, each mapped to its Supabase project |
| **Our docs say** | Just push to `main` on Vercel |
| **Fix** | Document git branching strategy with environment mapping |

#### 8. Missing `supabase db pull` for existing schemas

| | Details |
|---|---|
| **Supabase says** | Before starting local development, run `supabase db pull` to capture remote schema state |
| **Our docs say** | Nothing about pulling remote schema |
| **Fix** | Add to `ENVIRONMENT.md` setup steps |

#### 9. Missing `supabase db diff` as migration option

| | Details |
|---|---|
| **Supabase says** | Alternative migration workflow — make changes via Studio UI, then run `supabase db diff -f <name>` to auto-generate migration files |
| **Our docs say** | Only manual SQL files |
| **Fix** | Document both approaches in `ENVIRONMENT.md` |

### 🟢 MINOR GAPS (Nice to Have)

#### 10. No seed data strategy

| | Details |
|---|---|
| **Supabase says** | Supports `supabase/seed.sql` for test data |
| **Our docs say** | Nothing about seed data |
| **Fix** | Add `seed.sql` mention for dev/testing with mock conversation data |

---

## Files to Update

### 1. CLAUDE.md

- Update "Suggested Project Structure" — change `migrations/` → `supabase/migrations/`
- Add `supabase/config.toml`, `supabase/seed.sql` to project structure
- Add `SUPABASE_PROJECT_ID` to environment variables

### 2. PLAN.md

- **Phase 0**: Add `supabase init` step, Docker prerequisite
- **Phase 1**: Update migration path to `supabase/migrations/`, add `supabase db reset` for local testing, add type generation step
- **Phase 10**: Add GitHub Actions CI/CD workflows for migration deployment
- **New Phase 0.5**: Multi-environment Supabase setup

### 3. ENVIRONMENT.md

- Add Docker Desktop to prerequisites
- Rewrite "Database Setup" section:
  - Add `supabase init` first
  - Add `supabase start` for local development
  - Add `supabase db pull` for existing schemas
  - Add `supabase db diff` as alternative
  - Add `supabase gen types typescript` to workflow
- Add "Multi-Environment Setup" section (local / staging / production)
- Add "CI/CD Secrets" section with all required GitHub secrets
- Update "Database Migrations" section with correct paths
- Add "Branching Strategy" section mapping branches to environments

### 4. ARCHITECTURE.md

- Update "Database Schema" section — note migration path is `supabase/migrations/`
- Update "CI/CD Pipeline" section:
  - Add GitHub Actions for migration deployment
  - Add type generation validation
  - Map branches to Supabase environments
- Update "Environment Variables" table — add CI/CD secrets
- Add "Multi-Environment Architecture" subsection

---

## Detailed Changes

### CLAUDE.md — Project Structure Update

```
supabase/
  config.toml                    (Supabase CLI config)
  migrations/
    YYYYMMDD001_init.sql         (schema migration)
  seed.sql                       (test data for local dev)

src/
  ...existing structure...
  lib/
    db/
      types.ts                   (auto-generated from supabase gen types)
```

### PLAN.md — Phase 0 Update

Add to Phase 0:

```markdown
6. Initialize Supabase:
   ```bash
   supabase init
   supabase start  # Requires Docker Desktop
   ```
   This creates `supabase/` folder with `config.toml` and starts local Supabase.
   Local Studio available at http://localhost:54323
```

### PLAN.md — New Phase 0.5

```markdown
## Phase 0.5 — Multi-Environment Supabase Setup

**Goal:** Configure separate Supabase projects for staging and production.

1. Create two Supabase projects:
   - `caab-whatsapp-router-staging` (free tier)
   - `caab-whatsapp-router-prod` (free tier or pro)

2. Create `develop` branch:
   ```bash
   git checkout -b develop
   git push -u origin develop
   ```

3. Configure GitHub secrets:
   - `SUPABASE_ACCESS_TOKEN`: Personal access token from supabase.com/dashboard/account/tokens
   - `SUPABASE_DB_PASSWORD_STAGING`: Staging project database password
   - `SUPABASE_DB_PASSWORD_PRODUCTION`: Production project database password
   - `STAGING_PROJECT_ID`: Staging project ref from dashboard URL
   - `PRODUCTION_PROJECT_ID`: Production project ref from dashboard URL

4. Create GitHub Actions workflows:
   - `.github/workflows/ci.yml` — Validate types on PR
   - `.github/workflows/staging.yml` — Deploy migrations on merge to `develop`
   - `.github/workflows/production.yml` — Deploy migrations on merge to `main`

### Exit Criteria
- Local Supabase runs via Docker
- Staging and production Supabase projects exist
- GitHub Actions deploy migrations automatically
- TypeScript types are auto-generated and validated in CI
```

### ENVIRONMENT.md — New "Multi-Environment" Section

```markdown
## Multi-Environment Setup

### Environment Mapping

| Environment | Branch | Supabase | Vercel |
|---|---|---|---|
| Local Dev | `feature/*` | Docker (`supabase start`) | `localhost:3000` |
| Staging | `develop` | Staging project | Preview URL |
| Production | `main` | Production project | Production URL |

### Local Development (Docker)

```bash
supabase start
# Local Supabase running:
# - API:    http://localhost:54321
# - Studio: http://localhost:54323
# - DB:     postgresql://postgres:postgres@localhost:54322/postgres
```

### Staging Setup

```bash
supabase link --project-ref $STAGING_PROJECT_ID
supabase db push  # Apply migrations to staging
```

### Production Setup

Migrations are applied via GitHub Actions on merge to `main`.
**Never run `supabase db push` directly on production.**
```

### ENVIRONMENT.md — GitHub Actions Workflows

#### `.github/workflows/ci.yml`

```yaml
name: CI
on: pull_request

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - run: supabase db start
      - run: supabase db lint
      - name: Verify generated types match
        run: |
          supabase gen types typescript --local > src/lib/db/types.ts
          if ! git diff --ignore-space-at-eol --exit-code -- src/lib/db/types.ts; then
            echo "TypeScript types are out of date. Run: supabase gen types typescript --local > src/lib/db/types.ts"
            exit 1
          fi
```

#### `.github/workflows/staging.yml`

```yaml
name: Deploy Staging
on:
  push:
    branches: [develop]

jobs:
  deploy:
    runs-on: ubuntu-latest
    env:
      SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD_STAGING }}
      PROJECT_ID: ${{ secrets.STAGING_PROJECT_ID }}
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - run: supabase link --project-ref $PROJECT_ID
      - run: supabase db push
```

#### `.github/workflows/production.yml`

```yaml
name: Deploy Production
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    env:
      SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD_PRODUCTION }}
      PROJECT_ID: ${{ secrets.PRODUCTION_PROJECT_ID }}
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - run: supabase link --project-ref $PROJECT_ID
      - run: supabase db push
```

---

## Verification

After applying changes:

1. Run `supabase init` — verify `supabase/` folder is created
2. Run `supabase start` — verify local Supabase starts (requires Docker)
3. Create a test migration: `supabase migration new test` — verify it creates file in `supabase/migrations/`
4. Run `supabase gen types typescript --local` — verify types are generated
5. Verify GitHub Actions workflows are valid YAML
6. Verify all documentation references point to `supabase/migrations/` (not `migrations/`)
7. Verify branching strategy is consistent across all docs
