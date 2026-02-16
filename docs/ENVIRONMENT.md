# Development Environment Setup

## Prerequisites
- **Node.js 18+** (recommend using [nvm](https://github.com/nvm-sh/nvm))
- **npm** or **pnpm**
- **Git**
- **Docker Desktop** (required for local Supabase) - [download](https://www.docker.com/products/docker-desktop/)
- **Supabase CLI** (`npm install -g supabase`)
- **ngrok** account (free tier) - for local webhook testing
- **Supabase** account (free tier) - create staging + production projects
- **Groq** account (free tier) - create multiple API keys for rotation
- **Evolution API** instance (for testing)

---

## Initial Setup

### 1. Clone and Install
```bash
git clone <repository-url>
cd caab-whatsapp-router
npm install
```

### 2. Environment Variables
Create `.env.local` in the project root:

```bash
# Supabase Configuration
SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Evolution API Configuration
EVOLUTION_BASE_URL=https://your-evolution-api.com
EVOLUTION_API_KEY=your-evolution-api-key
EVOLUTION_INSTANCE=your-instance-name

# LLM Providers (comma-separated keys for rotation)
# Groq is required; Mistral and Cerebras are optional
GROQ_API_KEYS=gsk_key1,gsk_key2,gsk_key3
# MISTRAL_API_KEYS=mk_key1,mk_key2
# CEREBRAS_API_KEYS=ck_key1,ck_key2

# Optional model overrides per provider
# GROQ_MODEL=openai/gpt-oss-120b
# MISTRAL_MODEL=mistral-small-latest
# CEREBRAS_MODEL=llama-4-scout-17b-16e-instruct

# Task-to-provider routing (comma-separated task=provider pairs)
# Available tasks: classify_flow, classify_subroute, detect_topic_shift, extract_data, conversational_reply, summarize
# Unspecified tasks default to groq
# LLM_TASK_ROUTING=classify_flow=mistral,extract_data=cerebras

# Optional Configuration
WEBHOOK_SECRET=your-optional-webhook-secret
LOG_LEVEL=debug
NODE_ENV=development

# Flow version overrides (comma-separated key=value)
# Pin specific flows to a version for rollback, e.g.: digital_certificate=v1,billing=v1
# FLOW_VERSION_OVERRIDES=
```

**Important**: Never commit `.env.local` to git. It's already in `.gitignore`.

Create `.env.example` as a template (without actual secrets):
```bash
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
EVOLUTION_BASE_URL=
EVOLUTION_API_KEY=
EVOLUTION_INSTANCE=
GROQ_API_KEYS=
WEBHOOK_SECRET=
LOG_LEVEL=info
NODE_ENV=production
```

---

### 3. Database Setup with Supabase

Following [Supabase Managing Environments](https://supabase.com/docs/guides/deployment/managing-environments) guidelines.

#### Local Development (Recommended — uses Docker)
```bash
# Initialize Supabase (creates supabase/ folder with config.toml)
supabase init

# Start local Supabase (requires Docker Desktop running)
supabase start

# Output shows local URLs:
#   API URL:    http://localhost:54321
#   GraphQL URL: http://localhost:54321/graphql/v1
#   DB URL:     postgresql://postgres:postgres@localhost:54322/postgres
#   Studio URL: http://localhost:54323
#   anon key:   eyJ...
#   service_role key: eyJ...
```

Use the `service_role key` from the output in your `.env.local`:
```bash
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_ROLE_KEY=<service_role key from supabase start output>
```

#### Creating Migrations
```bash
# Option 1: Manual SQL (recommended for precise control)
supabase migration new init
# Edit the created file: supabase/migrations/YYYYMMDD_init.sql

# Option 2: Auto-generate from Studio UI changes
# Make changes via Studio at http://localhost:54323
# Then generate migration:
supabase db diff -f describe_your_change
```

#### Applying Migrations Locally
```bash
# Reset local DB and apply all migrations + seed data
supabase db reset

# Generate TypeScript types from schema
supabase gen types typescript --local > src/lib/db/types.ts
```

#### Staging/Production Setup
```bash
# Login to Supabase
supabase login

# Link to staging project (for manual deployment)
supabase link --project-ref $STAGING_PROJECT_ID
supabase db push   # Apply migrations to staging

# For production: migrations are deployed via GitHub Actions (never manually)
```

#### Pull Existing Remote Schema (for existing projects)
If you need to capture schema changes made via Supabase Dashboard:
```bash
supabase link --project-ref $PROJECT_ID
supabase db pull   # Creates migration file from current remote schema
```

---

### 4. Start Development Server
```bash
npm run dev
# Server runs on http://localhost:3000
```

Verify it's working:
```bash
curl http://localhost:3000/api/health
# Should return: {"status":"ok","timestamp":"..."}
```

---

### 5. Setup ngrok Tunnel (for Webhook Testing)

#### Install ngrok
```bash
# macOS
brew install ngrok

# Or download from https://ngrok.com/download
```

#### Start ngrok tunnel
```bash
# In a separate terminal (keep it running)
ngrok http 3000

# You'll see output like:
# Forwarding  https://abc123def456.ngrok.io -> http://localhost:3000
```

#### Configure Evolution API Webhook
1. Copy the HTTPS URL from ngrok (e.g., `https://abc123def456.ngrok.io`)
2. Go to your Evolution API dashboard or settings
3. Set webhook URL to: `https://abc123def456.ngrok.io/api/webhook/evolution`
4. Enable `messages.upsert` event
5. (Optional) Set webhook secret if you configured `WEBHOOK_SECRET`

---

### 6. Test Webhook Reception
Send a WhatsApp message to your Evolution instance number.

Check your terminal logs - you should see:
```json
{
  "level": "info",
  "event": "webhook_received",
  "userId": "5511999999999",
  "messageId": "...",
  "text": "Your message"
}
```

If you don't see logs:
- Check ngrok is running and URL is correct
- Verify Evolution webhook is configured correctly
- Check Evolution API logs for delivery failures
- Ensure port 3000 is not blocked by firewall

---

## Development Workflow

### Running the Application
```bash
# Development mode (hot reload)
npm run dev

# Build for production
npm run build

# Start production server (after build)
npm start

# Run linter
npm run lint

# Format code
npm run format
```

### Database Migrations

All migrations live in `supabase/migrations/` (not `migrations/` at root).

#### Create New Migration
```bash
# Option 1: Manual SQL (recommended)
supabase migration new add_new_field
# Creates: supabase/migrations/YYYYMMDD_add_new_field.sql
# Edit the file with your SQL changes

# Option 2: Auto-generate from Studio UI changes
# Make changes via Studio at http://localhost:54323
supabase db diff -f add_new_field
# Generates migration from diff between current schema and migrations
```

#### Apply Migrations Locally
```bash
# Reset local DB and re-apply all migrations + seed data
supabase db reset

# After schema changes, regenerate TypeScript types
supabase gen types typescript --local > src/lib/db/types.ts
```

#### Deploy Migrations to Staging (manual)
```bash
supabase link --project-ref $STAGING_PROJECT_ID
supabase db push
```

#### Deploy Migrations to Production
**Never run `supabase db push` directly on production.**
Migrations deploy automatically via GitHub Actions when merged to `main`.

#### Reset Database (CAUTION: Local only, deletes all data)
```bash
supabase db reset
```

---

### Viewing Logs

#### Development Logs
Logs output to console in pretty-printed format:
```
[INFO] 2026-02-11 14:30:45 - Webhook received from user 5511999999999
[DEBUG] 2026-02-11 14:30:46 - LLM call: globalRouter, confidence: 0.95
```

Use `LOG_LEVEL=debug` for detailed logs including:
- LLM prompts and responses
- Database queries
- API calls to Evolution

#### Production Logs (Vercel)
When deployed to Vercel:
- View logs in Vercel Dashboard → Functions
- Logs are JSON-formatted for parsing
- Filter by function name or time range

---

### Debugging

#### VS Code Debugger
Create `.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Next.js: debug server-side",
      "type": "node-terminal",
      "request": "launch",
      "command": "npm run dev"
    }
  ]
}
```

Set breakpoints in your code and press F5 to start debugging.

#### Database Debugging
- **Supabase Dashboard**: Table Editor to view/edit data
- **SQL Editor**: Run queries directly
- **Logs**: Check database query performance

#### Groq API Debugging
- View API usage in [Groq Dashboard](https://console.groq.com)
- Check rate limits per API key
- Review request/response logs

#### Evolution API Debugging
- Check Evolution API logs for webhook delivery
- Test sendText endpoint with curl:
  ```bash
  curl -X POST "https://your-evolution-api.com/message/sendText" \
    -H "apikey: your-api-key" \
    -H "Content-Type: application/json" \
    -d '{
      "number": "5511999999999",
      "text": "Test message"
    }'
  ```

---

## Common Issues & Solutions

### Webhook Not Receiving Messages

**Symptoms**: No logs when sending WhatsApp message

**Solutions**:
1. Verify ngrok is running (`ngrok http 3000`)
2. Check Evolution webhook URL matches ngrok URL exactly
3. Ensure `/api/webhook/evolution` path is correct
4. Check Evolution API logs for webhook delivery errors
5. Verify firewall isn't blocking port 3000
6. Test webhook manually:
   ```bash
   curl -X POST http://localhost:3000/api/webhook/evolution \
     -H "Content-Type: application/json" \
     -d '{"test": true}'
   ```

---

### Database Connection Errors

**Symptoms**: `Error: connect ETIMEDOUT` or similar

**Solutions**:
1. Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are correct
2. Check Supabase project is active (not paused)
3. Verify network connection
4. Check Supabase [status page](https://status.supabase.com)
5. Ensure you're using **service role key**, not anon key
6. Test connection:
   ```javascript
   const { createClient } = require('@supabase/supabase-js');
   const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
   client.from('conversation_state').select('*').limit(1).then(console.log);
   ```

---

### Groq Rate Limiting

**Symptoms**: `Error 429: Rate limit exceeded`

**Solutions**:
1. Verify you have multiple API keys in `GROQ_API_KEYS` (comma-separated)
2. Check [Groq Console](https://console.groq.com) for current usage
3. Create more free tier accounts for additional keys
4. Add delays between requests if hitting limits frequently
5. Consider upgrading to paid tier if needed
6. Check key rotation is working:
   ```javascript
   // Should cycle through keys
   console.log('Current key:', getCurrentGroqApiKey());
   ```

---

### Evolution API Errors

**Symptoms**: Messages not sending, API errors

**Solutions**:
1. Verify Evolution instance is connected to WhatsApp
2. Check `EVOLUTION_API_KEY` is valid
3. Verify `EVOLUTION_INSTANCE` name matches exactly
4. Check Evolution API documentation for version updates
5. Test Evolution API health:
   ```bash
   curl "https://your-evolution-api.com/instance/fetchInstances" \
     -H "apikey: your-api-key"
   ```
6. Ensure phone number format is correct (e.g., `5511999999999`)

---

### TypeScript Compilation Errors

**Symptoms**: `npm run dev` fails with type errors

**Solutions**:
1. Ensure all dependencies are installed: `npm install`
2. Check TypeScript version: `npx tsc --version`
3. Clear Next.js cache:
   ```bash
   rm -rf .next
   npm run dev
   ```
4. Verify `tsconfig.json` is correct
5. Check for missing type definitions:
   ```bash
   npm install -D @types/node
   ```

---

### ngrok Session Expired

**Symptoms**: Webhook stops working after a few hours

**Solutions**:
1. Free ngrok tunnels expire after 2 hours
2. Restart ngrok to get a new URL
3. Update Evolution webhook URL with new ngrok URL
4. Consider ngrok paid plan for persistent URLs
5. Or use Vercel preview deployments instead of ngrok

---

## Testing Checklist

Before committing code, verify:

- [ ] `npm run dev` starts without errors
- [ ] `npm run build` completes successfully
- [ ] Health check responds: `curl http://localhost:3000/api/health`
- [ ] Webhook receives test message
- [ ] Database tables exist and are accessible
- [ ] LLM calls work (send test message that requires routing)
- [ ] Messages send successfully via Evolution API
- [ ] No TypeScript errors: `npx tsc --noEmit`
- [ ] Code is formatted: `npm run lint`

---

## Multi-Environment Setup

Following [Supabase Managing Environments](https://supabase.com/docs/guides/deployment/managing-environments) guidelines, the project uses 3 tiers:

### Environment Mapping
| Environment | Git Branch | Supabase | Vercel | When |
|-------------|------------|----------|--------|------|
| Local Dev | feature/* | Docker (`supabase start`) | localhost:3000 | Active development |
| Staging | develop | Staging Supabase project | Vercel preview URL | Integration testing |
| Production | main | Production Supabase project | Vercel production URL | Live users |

### Local Development (Docker)
```bash
# Start local Supabase stack
supabase start

# Local services:
# - API: http://localhost:54321
# - Studio: http://localhost:54323
# - DB: postgresql://postgres:postgres@localhost:54322/postgres

# Stop when done
supabase stop
```

### Staging Environment
```bash
# Link to staging project
supabase link --project-ref $STAGING_PROJECT_ID

# Deploy migrations to staging manually
supabase db push

# Check migration status
supabase migration list
```

### Production Environment
- **Never** run `supabase db push` directly on production
- Migrations are deployed automatically via GitHub Actions on merge to `main`
- Rollback: create a new migration that reverses the change, merge to main

---

## Git Branching Strategy

```
feature/add-billing-flow  →  develop (staging)  →  main (production)
         ↓                        ↓                      ↓
   Local Supabase          Staging Supabase       Production Supabase
   (Docker)                (auto-deploy)          (auto-deploy)
```

### Workflow
1. **Create feature branch** from `develop`:
   ```bash
   git checkout develop
   git pull
   git checkout -b feature/my-feature
   ```

2. **Develop locally** (Docker Supabase + Next.js dev server):
   - Add migration files to `supabase/migrations/`
   - Regenerate types: `supabase gen types typescript --local > src/lib/db/types.ts`
   - Test locally with `supabase db reset`

3. **Open PR to develop**:
   - CI validates TypeScript types match schema
   - Team reviews code

4. **Merge to develop** → staging auto-deploy:
   - GitHub Actions applies migrations to staging Supabase
   - Vercel deploys preview for testing

5. **Merge develop to main** → production deploy:
   - GitHub Actions applies migrations to production Supabase
   - Vercel deploys to production

---

## CI/CD Secrets (GitHub Repository Settings)

Configure these in **GitHub → Repository → Settings → Secrets and variables → Actions**:

| Secret Name | Description | Where to Get |
|-------------|-------------|--------------|
| `SUPABASE_ACCESS_TOKEN` | Personal access token | supabase.com/dashboard/account/tokens |
| `SUPABASE_DB_PASSWORD_STAGING` | Staging DB password | Set during project creation |
| `SUPABASE_DB_PASSWORD_PRODUCTION` | Production DB password | Set during project creation |
| `STAGING_PROJECT_ID` | Staging project reference | Dashboard URL: `supabase.com/dashboard/project/<id>` |
| `PRODUCTION_PROJECT_ID` | Production project reference | Dashboard URL: `supabase.com/dashboard/project/<id>` |

---

## Next Steps

Once your development environment is set up:

1. **Test basic flow**: Send "Oi" via WhatsApp → verify bot responds
2. **Test digital certificate flow**: Say "preciso de certificado digital"
3. **Test data collection**: Complete purchase flow with valid data
4. **Test error handling**: Send invalid CPF, check retry logic
5. **Test session expiry**: Wait 30+ minutes, send new message
6. **Deploy to Vercel**: Push to GitHub, connect to Vercel

---

## Useful Commands

```bash
# Development
npm run dev              # Start dev server
npm run build            # Build for production
npm start                # Start production server
npm run lint             # Run ESLint
npm run format           # Format code with Prettier

# Database (Supabase CLI)
supabase db push         # Apply migrations
supabase db reset        # Reset database (DANGER!)
supabase migration new   # Create new migration
supabase status          # Check local Supabase status

# Git
git status               # Check changes
git add .                # Stage all changes
git commit -m "message"  # Commit changes
git push                 # Push to remote

# ngrok
ngrok http 3000          # Start tunnel
ngrok http 3000 --log=stdout  # With detailed logs
```

---

## Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Groq API Documentation](https://console.groq.com/docs)
- [Evolution API Documentation](https://doc.evolution-api.com/)
- [ngrok Documentation](https://ngrok.com/docs)
- [Zod Documentation](https://zod.dev/)

---

## Support

For issues or questions:
1. Check this documentation first
2. Review error logs carefully
3. Check external service status pages
4. Consult project team/maintainers
