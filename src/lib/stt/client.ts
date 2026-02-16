import OpenAI from "openai";
import { logger } from "@/lib/shared";
import { getProvider, nextApiKey } from "@/lib/llm/providers";

const MODEL = "whisper-large-v3";
const TIMEOUT_MS = 15000;
const MAX_TIMEOUT_RETRIES = 1;
const TRANSCRIPTION_PROMPT =
  "Transcrição de conversa por WhatsApp. O usuário pode ditar: " +
  "endereços de email falando 'arroba' para @ e 'ponto' para . " +
  "(ex: 'contato arroba empresa ponto com' = contato@empresa.com), " +
  "números de CPF (ex: 123.456.789-00), CNPJ, ou telefones com DDD.";

export async function transcribeAudio(
  audioBuffer: Buffer,
  fileName: string,
  correlationId?: string,
): Promise<string> {
  const provider = getProvider("groq");
  const maxAttempts = provider.keys.length;
  let timeoutRetries = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const apiKey = nextApiKey(provider);
    const client = new OpenAI({
      apiKey,
      baseURL: provider.baseURL,
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

      // Rate limit — retry with next key
      if (
        err instanceof OpenAI.APIError &&
        err.status === 429 &&
        attempt < maxAttempts - 1
      ) {
        logger.warn({
          correlation_id: correlationId,
          event: "stt_rate_limited",
          model: MODEL,
          attempt: attempt + 1,
          duration_ms: durationMs,
        });
        continue;
      }

      // Timeout — retry with same key rotation
      if (
        err instanceof OpenAI.APIConnectionTimeoutError &&
        timeoutRetries < MAX_TIMEOUT_RETRIES
      ) {
        timeoutRetries++;
        logger.warn({
          correlation_id: correlationId,
          event: "stt_timeout_retry",
          model: MODEL,
          attempt: timeoutRetries,
          duration_ms: durationMs,
        });
        attempt--; // retry with same key rotation position
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
