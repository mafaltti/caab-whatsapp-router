# Phase 6 — Manual Testing Guide (Digital Certificate Flow)

## Prerequisites

- Supabase running (local or cloud)
- Evolution API configured with a WhatsApp instance
- Groq API keys in `.env.local` (`GROQ_API_KEYS=key1,key2,...`)
- All 6 required env vars filled in `.env.local`

---

## Step 1 — Install ngrok

Download from https://ngrok.com/download or install via:

```
choco install ngrok
```
or
```
winget install ngrok.ngrok
```

After installing, authenticate (free account at ngrok.com):

```
ngrok config add-authtoken YOUR_TOKEN
```

## Step 2 — Start your dev server

```
npm run dev
```

This runs on `http://localhost:3000` by default.

## Step 3 — Start ngrok tunnel

In a **separate terminal**:

```
ngrok http 3000
```

You'll see output like:

```
Forwarding  https://abc123.ngrok-free.app -> http://localhost:3000
```

Copy that `https://...ngrok-free.app` URL.

## Step 4 — Configure Evolution API webhook

Set the webhook in your Evolution instance to point to your ngrok URL:

```
PUT {EVOLUTION_BASE_URL}/webhook/set/{EVOLUTION_INSTANCE}
```

Body:
```json
{
  "webhook": {
    "url": "https://abc123.ngrok-free.app/api/webhook/evolution",
    "enabled": true,
    "events": ["MESSAGES_UPSERT"],
    "webhookByEvents": false
  }
}
```

With header: `apikey: YOUR_EVOLUTION_API_KEY`

## Step 5 — Verify the pipeline

Send **"teste"** from your WhatsApp to the bot number. In your `npm run dev` terminal you should see JSON log lines with `webhook_received`. The bot should reply with the unknown flow menu.

If you don't see logs, check:
- ngrok dashboard at `http://127.0.0.1:4040` shows incoming requests
- `.env.local` has all 6 required vars filled in

---

## Test Scenarios

Run these tests **in order** from your WhatsApp. Reset the session between tests (see bottom of this doc).

### Test A: Enter flow + Purchase subroute (happy path)

| # | You send | Expected bot reply |
|---|----------|--------------------|
| 1 | `Preciso de certificado digital` | Lists 5 options (comprar, renovar, status, requisitos, suporte) OR directly asks person type if subroute classification succeeds |
| 2 | `Quero comprar` | "Você é pessoa física (PF) ou pessoa jurídica (PJ)?" |
| 3 | `Pessoa física` | "Certo, pessoa física! Agora preciso do seu CPF." |
| 4 | `12345678901` | "CPF registrado! Qual seu melhor email para contato?" |
| 5 | `teste@email.com` | "Email registrado! Agora, qual seu telefone com DDD?" |
| 6 | `11999998888` | Summary with all 4 fields + "Está tudo correto? (sim/não)" |
| 7 | `sim` | Protocol number + success message + session ends |

### Test B: Invalid CPF retries + human handoff

| # | You send | Expected |
|---|----------|----------|
| 1 | `Quero comprar certificado digital` | Enters purchase → asks PF/PJ |
| 2 | `PF` | Asks CPF |
| 3 | `123` | "O CPF informado parece inválido..." (retry 1) |
| 4 | `456` | Same retry message (retry 2) |
| 5 | `789` | Same retry message (retry 3) |
| 6 | `000` | "Vou transferir você para um atendente humano..." (handoff) |

### Test C: Correction flow

| # | You send | Expected |
|---|----------|----------|
| 1 | `Certificado digital, quero comprar` | Enters purchase |
| 2 | `PF` | Asks CPF |
| 3 | `12345678901` | Asks email |
| 4 | `teste@email.com` | Asks phone |
| 5 | `11999998888` | Shows summary |
| 6 | `não` | "Qual dado gostaria de corrigir? 1-4" |
| 7 | `3` | "Certo! Envie o email correto." |
| 8 | `novo@email.com` | Shows updated summary with new email |
| 9 | `sim` | Protocol + success |

### Test D: Renewal subroute

| # | You send | Expected |
|---|----------|----------|
| 1 | `Quero renovar meu certificado` | Asks order/protocol number |
| 2 | `CD-20260101-A1B2` | Asks email |
| 3 | `teste@email.com` | Shows renewal summary |
| 4 | `sim` | Protocol + success |

### Test E: Support subroute

| # | You send | Expected |
|---|----------|----------|
| 1 | `Estou com problema no certificado` | "Descreva o problema..." |
| 2 | `Meu certificado não aparece no navegador` | Asks for order ID (optional) |
| 3 | `não` | Shows support summary (order: não informado) |
| 4 | `sim` | Protocol + "técnico entrará em contato" |

### Test F: Requirements subroute

| # | You send | Expected |
|---|----------|----------|
| 1 | `Quais documentos preciso para certificado?` | Lists PF and PJ requirements + "Gostaria de iniciar uma compra?" |
| 2 | `não` | Goodbye message, session ends |

### Test G: Status subroute

| # | You send | Expected |
|---|----------|----------|
| 1 | `Quero ver o status do meu pedido` | Asks for order number |
| 2 | `CD-20260212-1234` | Shows mock status (last digit 4 → "Aguardando validação") |

### Test H: Session persistence

| # | You send | Expected |
|---|----------|----------|
| 1 | `Comprar certificado` | Enters purchase → asks PF/PJ |
| 2 | `PF` | Asks CPF |
| — | **Stop `npm run dev`, restart it** | — |
| 3 | `12345678901` | Asks email (session was loaded from Supabase, not lost) |

---

## Quick session reset between tests

To avoid waiting 30 minutes for session expiry, run this in your Supabase SQL editor or `psql`:

```sql
DELETE FROM conversation_state WHERE user_id = 'YOUR_WHATSAPP_NUMBER_DIGITS';
```

Replace with your actual phone number (digits only, no `@s.whatsapp.net`).
