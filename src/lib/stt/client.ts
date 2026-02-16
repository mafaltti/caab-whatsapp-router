import OpenAI from "openai";
import { logger } from "@/lib/shared";
import { getProvider, nextApiKey } from "@/lib/llm/providers";
import type { ProviderId } from "@/lib/llm/providers";

export type SttProviderId = "groq" | "mistral";

const TIMEOUT_MS = 15000;
const MAX_TIMEOUT_RETRIES = 1;

const STT_CONFIG: Record<
  SttProviderId,
  {
    model: string;
    providerId: ProviderId;
    extraParams: () => Record<string, unknown>;
  }
> = {
  groq: {
    model: "whisper-large-v3",
    providerId: "groq",
    extraParams: () => ({
      prompt:
        "Transcrição de conversa por WhatsApp. O usuário pode ditar: " +
        "endereços de email falando 'arroba' para @ e 'ponto' para . " +
        "(ex: 'contato arroba empresa ponto com' = contato@empresa.com), " +
        "números de CPF (ex: 123.456.789-00), CNPJ, ou telefones com DDD.",
    }),
  },
  mistral: {
    model: "voxtral-mini-latest",
    providerId: "mistral",
    extraParams: () => ({
      context_bias: "arroba,ponto,com,org,br,CPF,CNPJ,DDD",
    }),
  },
};

function getSttProvider(): SttProviderId {
  const raw = process.env.STT_PROVIDER;
  if (raw === "mistral") return "mistral";
  return "groq";
}

export async function transcribeAudio(
  audioBuffer: Buffer,
  fileName: string,
  correlationId?: string,
): Promise<string> {
  const sttProviderId = getSttProvider();
  const config = STT_CONFIG[sttProviderId];
  const provider = getProvider(config.providerId);
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
        model: config.model,
        language: "pt",
        temperature: 0,
        ...config.extraParams(),
      });

      const durationMs = Math.round(performance.now() - start);

      logger.info({
        correlation_id: correlationId,
        event: "stt_transcription",
        stt_provider: sttProviderId,
        model: config.model,
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
          stt_provider: sttProviderId,
          model: config.model,
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
          stt_provider: sttProviderId,
          model: config.model,
          attempt: timeoutRetries,
          duration_ms: durationMs,
        });
        attempt--; // retry with same key rotation position
        continue;
      }

      logger.error({
        correlation_id: correlationId,
        event: "stt_transcription_error",
        stt_provider: sttProviderId,
        model: config.model,
        duration_ms: durationMs,
        error: err instanceof Error ? err.message : String(err),
      });

      throw err;
    }
  }

  throw new Error(
    `All ${sttProviderId} API keys exhausted for STT`,
  );
}
