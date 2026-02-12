# Development Environment Setup

## Prerequisites
- **Node.js 18+** (recommend using [nvm](https://github.com/nvm-sh/nvm))
- **npm** or **pnpm**
- **Git**
- **ngrok** account (free tier) - for local webhook testing
- **Supabase** account (free tier)
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

# Groq API (comma-separated keys for rotation)
# Create 3-5 free tier accounts for better rate limits
GROQ_API_KEYS=gsk_key1,gsk_key2,gsk_key3

# Optional Configuration
WEBHOOK_SECRET=your-optional-webhook-secret
LOG_LEVEL=debug
NODE_ENV=development
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

#### Option A: Using Supabase Dashboard (Easier)
1. Go to your [Supabase Dashboard](https://app.supabase.com)
2. Create a new project (or use existing)
3. Go to **SQL Editor**
4. Copy contents of `migrations/YYYYMMDD001_init.sql`
5. Run the migration
6. Verify tables created: `conversation_state`, `chat_messages`

#### Option B: Using Supabase CLI (Recommended for team)
```bash
# Install Supabase CLI globally
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref your-project-ref

# Push migrations to database
supabase db push

# Verify migration status
supabase migration list
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

#### Create New Migration
```bash
# Using Supabase CLI
supabase migration new add_new_field

# This creates: migrations/YYYYMMDD_add_new_field.sql
# Edit the file with your SQL changes
```

#### Apply Migrations
```bash
# Local development
supabase db push

# Production (via Supabase Dashboard)
# Copy SQL and run in SQL Editor
```

#### Reset Database (CAUTION: Deletes all data)
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
