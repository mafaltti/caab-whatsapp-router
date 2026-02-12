import { logger } from "@/lib/shared";
import type { ChatMessage } from "@/lib/db";
import { GlobalRouterSchema, type GlobalRouterResult } from "./schemas";
import { globalRouterSystemPrompt, globalRouterUserPrompt } from "./prompts";
import { callLlm } from "./client";

const FALLBACK: GlobalRouterResult = {
  flow: "unknown",
  confidence: 0,
  reason: "Fallback",
};

interface ClassifyFlowOptions {
  text: string;
  chatHistory: ChatMessage[];
  correlationId?: string;
}

export async function classifyFlow(
  options: ClassifyFlowOptions,
): Promise<GlobalRouterResult> {
  const { text, chatHistory, correlationId } = options;

  try {
    const result = await callLlm({
      systemPrompt: globalRouterSystemPrompt(),
      userPrompt: globalRouterUserPrompt(text, chatHistory),
      correlationId,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(result.content);
    } catch {
      logger.warn({
        correlation_id: correlationId,
        event: "llm_invalid_json",
        raw_content: result.content.slice(0, 200),
      });
      return FALLBACK;
    }

    const validation = GlobalRouterSchema.safeParse(parsed);

    if (!validation.success) {
      logger.warn({
        correlation_id: correlationId,
        event: "llm_schema_validation_failed",
        raw_content: result.content.slice(0, 200),
      });
      return FALLBACK;
    }

    return validation.data;
  } catch {
    return FALLBACK;
  }
}
