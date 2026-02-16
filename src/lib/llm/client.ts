import OpenAI from "openai";
import { logger } from "@/lib/shared";
import {
  type ProviderId,
  getProvider,
  nextApiKey,
} from "./providers";
import { type LlmTask, getProviderForTask } from "./taskRouter";

export class SafetyOverrideError extends Error {
  readonly failedGeneration: string;

  constructor(failedGeneration: string) {
    super("LLM safety override: json_validate_failed");
    this.name = "SafetyOverrideError";
    this.failedGeneration = failedGeneration;
  }
}

const DEFAULT_MAX_TOKENS = 500;
const DEFAULT_TEMPERATURE = 0;
const TIMEOUT_MS = 8000;

export interface LlmCallOptions {
  systemPrompt: string;
  userPrompt: string;
  correlationId?: string;
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  provider?: ProviderId;
  task?: LlmTask;
  model?: string;
}

export interface LlmCallResult {
  content: string;
  durationMs: number;
  model: string;
  provider: ProviderId;
  tokensUsed?: number;
}

function detectGroqSafetyOverride(err: unknown): string | null {
  if (
    err instanceof OpenAI.BadRequestError ||
    (err instanceof OpenAI.APIError && err.status === 400)
  ) {
    const apiErr = err as InstanceType<typeof OpenAI.APIError> & {
      error?: Record<string, unknown>;
    };
    const body = apiErr.error as Record<string, unknown> | undefined;
    const inner = body?.error as Record<string, unknown> | undefined;
    if (
      inner?.code === "json_validate_failed" &&
      typeof inner?.failed_generation === "string" &&
      inner.failed_generation.length > 0
    ) {
      const isGroqError =
        inner.failed_generation.includes("max completion tokens") ||
        inner.failed_generation.includes("failed to generate");
      if (!isGroqError) {
        return inner.failed_generation;
      }
    }
  }
  return null;
}

export async function callLlm(options: LlmCallOptions): Promise<LlmCallResult> {
  const {
    systemPrompt,
    userPrompt,
    correlationId,
    maxTokens = DEFAULT_MAX_TOKENS,
    temperature = DEFAULT_TEMPERATURE,
    jsonMode = true,
    task,
    model: modelOverride,
  } = options;

  // Provider resolution: explicit > task-based > default ("groq")
  const providerId = options.provider ?? getProviderForTask(task);
  const provider = getProvider(providerId);
  const model = modelOverride ?? provider.model;

  const maxAttempts = provider.keys.length;

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
      const response = await client.chat.completions.create({
        model,
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
        provider: providerId,
        model,
        duration_ms: durationMs,
        tokens_used: tokensUsed,
      });

      return { content, durationMs, model, provider: providerId, tokensUsed };
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
          event: "llm_rate_limited",
          provider: providerId,
          model,
          attempt: attempt + 1,
          duration_ms: durationMs,
        });
        continue;
      }

      // Groq-specific safety override detection
      if (providerId === "groq") {
        const failedGen = detectGroqSafetyOverride(err);
        if (failedGen) {
          logger.info({
            correlation_id: correlationId,
            event: "llm_safety_override_detected",
            provider: providerId,
            model,
            duration_ms: durationMs,
          });
          throw new SafetyOverrideError(failedGen);
        }
      }

      logger.error({
        correlation_id: correlationId,
        event: "llm_call_error",
        provider: providerId,
        model,
        duration_ms: durationMs,
        error: err instanceof Error ? err.message : String(err),
      });

      throw err;
    }
  }

  throw new Error(`All ${providerId} API keys exhausted`);
}
