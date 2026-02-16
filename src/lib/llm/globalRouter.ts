import { logger } from "@/lib/shared";
import type { ChatMessage } from "@/lib/db";
import { GlobalRouterSchema, type GlobalRouterResult } from "./schemas";
import { globalRouterSystemPrompt, globalRouterUserPrompt } from "./prompts";
import { callLlm, SafetyOverrideError } from "./client";

export type ClassifyFlowResult =
  | { ok: true; data: GlobalRouterResult }
  | { ok: false; errorType: "llm_error" | "invalid_json" | "schema_validation" };

interface ClassifyFlowOptions {
  text: string;
  chatHistory: ChatMessage[];
  correlationId?: string;
}

export async function classifyFlow(
  options: ClassifyFlowOptions,
): Promise<ClassifyFlowResult> {
  const { text, chatHistory, correlationId } = options;

  let rawContent: string;
  try {
    const result = await callLlm({
      systemPrompt: globalRouterSystemPrompt(),
      userPrompt: globalRouterUserPrompt(text, chatHistory),
      correlationId,
      task: "classify_flow",
    });
    rawContent = result.content;
  } catch (err) {
    if (err instanceof SafetyOverrideError) throw err;
    logger.error({
      correlation_id: correlationId,
      event: "classify_flow_llm_error",
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, errorType: "llm_error" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    logger.warn({
      correlation_id: correlationId,
      event: "llm_invalid_json",
      raw_content: rawContent.slice(0, 200),
    });
    return { ok: false, errorType: "invalid_json" };
  }

  const validation = GlobalRouterSchema.safeParse(parsed);

  if (!validation.success) {
    logger.warn({
      correlation_id: correlationId,
      event: "llm_schema_validation_failed",
      raw_content: rawContent.slice(0, 200),
    });
    return { ok: false, errorType: "schema_validation" };
  }

  return { ok: true, data: validation.data };
}
