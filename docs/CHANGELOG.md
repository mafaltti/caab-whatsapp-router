# Changelog
All notable changes to this project will be documented in this file.

## Unreleased
### Added
-

### Fixed
-

## 2026-02-12

### Phase 0.5 — Multi-Environment CI/CD Setup
#### Changed
- CI workflow (`ci.yml`): use `supabase db start` instead of `supabase start` (faster in CI)
- CI workflow: add `workflow_dispatch` trigger for manual runs
- CI workflow: show `git diff` output on type check failure for debugging
- Staging workflow (`staging.yml`): add `workflow_dispatch`, concurrency group, `SUPABASE_PROJECT_ID` env var
- Production workflow (`production.yml`): add `workflow_dispatch`, concurrency group, `SUPABASE_PROJECT_ID` env var

#### Removed
- Deleted stale `nul` file (Windows artifact)

### Phase 0 — Project Bootstrap
#### Added
- Next.js 15.3 with TypeScript and ESLint configuration
- Health check endpoint (`GET /api/health`)
- Evolution webhook stub (`POST /api/webhook/evolution`)
- Supabase CLI initialization (`supabase/config.toml`)
- Baseline Supabase TypeScript types (`src/lib/db/types.ts`)
- Library directory structure with placeholders (`db`, `evolution`, `flows`, `llm`, `shared`, `webhook`)
- GitHub Actions CI/CD workflows (`ci.yml`, `staging.yml`, `production.yml`)
- Environment variable template (`.env.example`)
- `nul` added to `.gitignore` (Windows artifact prevention)
- Documentation moved to `docs/` directory, old decision records archived to `docs/archived/`
- Initial project documentation (ARCHITECTURE, ENVIRONMENT, FLOWS, PLAN)
