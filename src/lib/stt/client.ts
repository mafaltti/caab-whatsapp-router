import Groq from "groq-sdk";
import { RateLimitError } from "groq-sdk/error";
import { logger } from "@/lib/shared";

const MODEL = "whisper-large-v3";
const TIMEOUT_MS = 30000;
const TRANSCRIPTION_PROMPT =
  "Transcrição de conversa por WhatsApp. O usuário pode ditar: " +
  "endereços de email (ex: contato@empresa.com, nome@gmail.com), " +
  "números de CPF (ex: 123.456.789-00), CNPJ, ou telefones com DDD.";

function getApiKeys(): string[] {
  const raw = process.env.GROQ_API_KEYS;
  if (!raw) throw new Error("Missing env var GROQ_API_KEYS");
  const keys = raw.split(",").filter(Boolean);
  if (keys.length === 0) throw new Error("GROQ_API_KEYS is empty");
  return keys;
}

let keyIndex = 0;

function nextKey(keys: string[]): string {
  const key = keys[keyIndex % keys.length];
  keyIndex = (keyIndex + 1) % keys.length;
  return key;
}

export async function transcribeAudio(
  audioBuffer: Buffer,
  fileName: string,
  correlationId?: string,
): Promise<string> {
  const keys = getApiKeys();
  const maxAttempts = keys.length;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const apiKey = nextKey(keys);
    const client = new Groq({
      apiKey,
      timeout: TIMEOUT_MS,
      maxRetries: 0,
    });

    const start = performance.now();

    try {
      const arrayBuffer = audioBuffer.buffer.slice(
        audioBuffer.byteOffset,
        audioBuffer.byteOffset + audioBuffer.byteLength,
      ) as ArrayBuffer;
      // Groq validates file type by extension, not MIME type
      const safeName = fileName.endsWith(".ogg") ? fileName : "audio.ogg";
      const file = new File([arrayBuffer], safeName, { type: "audio/ogg" });

      const transcription = await client.audio.transcriptions.create({
        file,
        model: MODEL,
        language: "pt",
        temperature: 0,
        prompt: TRANSCRIPTION_PROMPT,
      });

      const durationMs = Math.round(performance.now() - start);

      logger.info({
        correlation_id: correlationId,
        event: "stt_transcription",
        model: MODEL,
        duration_ms: durationMs,
        audio_size_bytes: audioBuffer.length,
      });

      return transcription.text;
    } catch (err) {
      const durationMs = Math.round(performance.now() - start);

      if (err instanceof RateLimitError && attempt < maxAttempts - 1) {
        logger.warn({
          correlation_id: correlationId,
          event: "stt_rate_limited",
          model: MODEL,
          attempt: attempt + 1,
          duration_ms: durationMs,
        });
        continue;
      }

      logger.error({
        correlation_id: correlationId,
        event: "stt_transcription_error",
        model: MODEL,
        duration_ms: durationMs,
        error: err instanceof Error ? err.message : String(err),
      });

      throw err;
    }
  }

  throw new Error("All Groq API keys exhausted for STT");
}
