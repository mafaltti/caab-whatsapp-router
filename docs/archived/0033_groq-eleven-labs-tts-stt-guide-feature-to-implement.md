# Groq Speech-to-Text & Text-to-Speech Guide

## QUESTION: Groq.com "whisper-large-v3-turbo" can do speech to text but it also can do reverse? Text to speech?

The short answer is **no**, the model `whisper-large-v3-turbo` itself cannot perform "reverse" Text-to-Speech (TTS). It is a dedicated Speech-to-Text (STT) model designed to transcribe or translate audio into text with high speed and accuracy.

However, Groq does offer Text-to-Speech capabilities on its platform—you just have to use a different model.

### 1. Whisper is for Speech-to-Text (STT)

The Whisper family (including the `large-v3-turbo` version) was developed by OpenAI specifically for:

- **Transcription:** Converting spoken audio into text in the same language.
- **Translation:** Converting spoken audio in various languages into English text.
- **Timestamping:** Identifying exactly when words are spoken.

It lacks the "decoder" architecture required to synthesize human-like audio from text.

### 2. Groq's Text-to-Speech (TTS) Options

If you want the "reverse" (Text-to-Speech), Groq provides specialized models through its `/v1/audio/speech` endpoint. As of early 2026, these include:

| Model ID | Language | Description |
|---|---|---|
| `canopylabs/orpheus-v1-english` | English | High-quality, expressive voices with pacing control. |
| `canopylabs/orpheus-arabic-saudi` | Arabic | Optimized for Saudi dialect synthesis. |
| `playai-tts` | Multilingual | (Partner model) Extremely fast synthesis (up to 140 chars/sec). |

### 3. How to Use Them Together

To build a "voice-to-voice" loop (like a real-time assistant), you would typically chain these models together:

1. **Audio In** → `whisper-large-v3-turbo` → **Text**
2. **Text** → `llama-3.3-70b` (for reasoning) → **Response Text**
3. **Response Text** → `canopylabs/orpheus-v1-english` → **Audio Out**

Because Groq's LPU (Language Processing Unit) is so fast, this entire loop can often happen in under a second, making it feel like a real conversation.

---

## QUESTION: Does it offer Brazilian Portuguese "speecher" orator?

As of February 2026, Groq does **not** yet offer a native Brazilian Portuguese "speecher" (TTS model).

While Groq's Speech-to-Text (Whisper) is excellent at understanding Portuguese, their Text-to-Speech (TTS) capabilities are currently limited to specific languages.

### Current Groq TTS Lineup

On the GroqCloud platform, the available Text-to-Speech models are:

- `canopylabs/orpheus-v1-english`: Highly expressive English voices (like "Austin" or "Autumn") that support vocal directions like `[whisper]` or `[cheerful]`.
- `canopylabs/orpheus-arabic-saudi`: Authentic Saudi dialect voices.

### Why You Might See "Portuguese" Mentioned

There are two common reasons for confusion:

1. **Speech-to-Text (STT):** If you use `whisper-large-v3-turbo` on Groq, it can transcribe Brazilian Portuguese audio into text perfectly. However, it cannot "speak" that text back to you.
2. **xAI's "Grok" vs. "Groq":** There is a common mix-up between **Groq** (the hardware/cloud company) and **Grok** (the AI from Elon Musk's xAI). xAI's Grok does have a Voice Agent API that supports Brazilian Portuguese with voices like "Ara" and "Rex."

### How to Get a Portuguese "Speecher" Today

If you want the speed of Groq but need a Brazilian Portuguese voice, most developers use a **"Hybrid" stack**:

1. **Input:** User speaks → Groq (Whisper) converts to text.
2. **Brain:** Text → Groq (Llama 3.3) generates a Portuguese response.
3. **Output:** Response → ElevenLabs or Google Cloud TTS (which have high-quality Brazilian "orators" like Vitoria or Ricardo) generates the audio.

---

## QUESTION: ElevenLabs or Google Cloud TTS have free tier?

Yes, both ElevenLabs and Google Cloud TTS offer free tiers, but they operate very differently in terms of how much you get and how realistic the voices sound.

Here is the breakdown for Brazilian Portuguese:

### 1. ElevenLabs (The "High Quality" Choice)

ElevenLabs is currently the industry leader for "emotional" and human-like voices.

- **Free Tier Limit:** 10,000 characters per month (roughly 10–15 minutes of audio).
- **Brazilian Portuguese Support:** Fully supported. Their "Multilingual v2" model automatically detects Portuguese text and applies a natural Brazilian accent.
- **Pros:** The voices sound incredibly real; they breathe, pause, and have natural inflection. No credit card is required to start.
- **Cons:** 10k characters go very quickly (about 4–5 pages of double-spaced text). You cannot use the audio for commercial purposes (monetized YouTube, ads, etc.) on the free plan, and you must attribute them ("Created with ElevenLabs").

### 2. Google Cloud TTS (The "High Volume" Choice)

Google is better if you need to process massive amounts of text but don't mind a slightly more "GPS-like" voice.

- **Free Tier Limit:**
  - **Standard Voices:** 4 million characters per month free.
  - **Neural2 / WaveNet Voices:** 1 million characters per month free.
- **Brazilian Portuguese Support:** Excellent. They have specific `pt-BR` voices (like `pt-BR-Neural2-A` or `pt-BR-Wavenet-B`).
- **Pros:** Huge free limit. You can generate hours of audio for free every month.
- **Cons:** Requires a Google Cloud account (which usually requires a credit card for identity verification). The setup is technical—you have to manage API keys and cloud projects.

### Comparison at a Glance

| Feature | ElevenLabs | Google Cloud TTS |
|---|---|---|
| Free Characters | 10,000 / month | 1,000,000+ / month |
| Voice Realism | Elite (Sounds human) | Good (Sounds like a high-end bot) |
| Ease of Use | Very Easy (Web interface) | Technical (API / Developers) |
| Portuguese pt-BR | Included in Multilingual | Dedicated pt-BR models |
| Commercial Use | Paid plans only | Allowed on Free Tier |

### Which Should You Choose?

- **Choose ElevenLabs** if you are making a video, a game, or a podcast where the emotion and "soul" of the voice matters most.
- **Choose Google Cloud** if you are building an app, a long-form article reader, or a tool where you need to convert thousands of words every day for free.
