import Groq from "groq-sdk";
import { BadRequestError, RateLimitError } from "groq-sdk/error";
import { logger } from "@/lib/shared";

export class SafetyOverrideError extends Error {
  readonly failedGeneration: string;

  constructor(failedGeneration: string) {
    super("LLM safety override: json_validate_failed");
    this.name = "SafetyOverrideError";
    this.failedGeneration = failedGeneration;
  }
}

const MODEL = "openai/gpt-oss-120b";
const DEFAULT_MAX_TOKENS = 500;
const DEFAULT_TEMPERATURE = 0;
const TIMEOUT_MS = 8000;

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

export interface LlmCallOptions {
  systemPrompt: string;
  userPrompt: string;
  correlationId?: string;
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
}

export interface LlmCallResult {
  content: string;
  durationMs: number;
  model: string;
  tokensUsed?: number;
}

export async function callLlm(options: LlmCallOptions): Promise<LlmCallResult> {
  const {
    systemPrompt,
    userPrompt,
    correlationId,
    maxTokens = DEFAULT_MAX_TOKENS,
    temperature = DEFAULT_TEMPERATURE,
    jsonMode = true,
  } = options;

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
      const response = await client.chat.completions.create({
        model: MODEL,
        temperature,
        max_tokens: maxTokens,
        ...(jsonMode && { response_format: { type: "json_object" as const } }),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });

      const durationMs = Math.round(performance.now() - start);
      const content = response.choices[0]?.message?.content ?? "";
      const tokensUsed = response.usage?.total_tokens;

      logger.info({
        correlation_id: correlationId,
        event: "llm_call",
        model: MODEL,
        duration_ms: durationMs,
        tokens_used: tokensUsed,
      });

      return { content, durationMs, model: MODEL, tokensUsed };
    } catch (err) {
      const durationMs = Math.round(performance.now() - start);

      if (err instanceof RateLimitError && attempt < maxAttempts - 1) {
        logger.warn({
          correlation_id: correlationId,
          event: "llm_rate_limited",
          model: MODEL,
          attempt: attempt + 1,
          duration_ms: durationMs,
        });
        continue;
      }

      if (err instanceof BadRequestError) {
        const body = err.error as Record<string, unknown> | undefined;
        const inner = body?.error as Record<string, unknown> | undefined;
        if (
          inner?.code === "json_validate_failed" &&
          typeof inner?.failed_generation === "string" &&
          inner.failed_generation.length > 0
        ) {
          // Groq system error messages are not safety overrides
          const isGroqError =
            inner.failed_generation.includes("max completion tokens") ||
            inner.failed_generation.includes("failed to generate");
          if (!isGroqError) {
            logger.info({
              correlation_id: correlationId,
              event: "llm_safety_override_detected",
              model: MODEL,
              duration_ms: durationMs,
            });
            throw new SafetyOverrideError(inner.failed_generation);
          }
        }
      }

      logger.error({
        correlation_id: correlationId,
        event: "llm_call_error",
        model: MODEL,
        duration_ms: durationMs,
        error: err instanceof Error ? err.message : String(err),
      });

      throw err;
    }
  }

  // Should not reach here, but satisfy TypeScript
  throw new Error("All Groq API keys exhausted");
}
