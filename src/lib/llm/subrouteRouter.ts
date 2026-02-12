import { logger } from "@/lib/shared";
import type { ChatMessage } from "@/lib/db";
import {
  SubrouteRouterSchema,
  type SubrouteRouterResult,
  SUBROUTE_CONFIG,
} from "./schemas";
import { subrouteRouterSystemPrompt, subrouteRouterUserPrompt } from "./prompts";
import { callLlm } from "./client";

export type ClassifySubrouteResult =
  | { ok: true; data: SubrouteRouterResult }
  | {
      ok: false;
      errorType:
        | "llm_error"
        | "invalid_json"
        | "schema_validation"
        | "invalid_subroute"
        | "no_subroutes";
    };

interface ClassifySubrouteOptions {
  text: string;
  flow: string;
  chatHistory: ChatMessage[];
  correlationId?: string;
}

export async function classifySubroute(
  options: ClassifySubrouteOptions,
): Promise<ClassifySubrouteResult> {
  const { text, flow, chatHistory, correlationId } = options;

  // Stage 1: Check if flow has subroutes
  const subroutes = SUBROUTE_CONFIG[flow];
  if (!subroutes || subroutes.length === 0) {
    logger.info({
      correlation_id: correlationId,
      event: "classify_subroute_no_config",
      flow,
    });
    return { ok: false, errorType: "no_subroutes" };
  }

  // Stage 2: Call LLM
  let rawContent: string;
  try {
    const result = await callLlm({
      systemPrompt: subrouteRouterSystemPrompt(flow, subroutes),
      userPrompt: subrouteRouterUserPrompt(text, chatHistory),
      correlationId,
    });
    rawContent = result.content;
  } catch (err) {
    logger.error({
      correlation_id: correlationId,
      event: "classify_subroute_llm_error",
      flow,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, errorType: "llm_error" };
  }

  // Stage 3: Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    logger.warn({
      correlation_id: correlationId,
      event: "classify_subroute_invalid_json",
      flow,
      raw_content: rawContent.slice(0, 200),
    });
    return { ok: false, errorType: "invalid_json" };
  }

  // Stage 4: Validate schema
  const validation = SubrouteRouterSchema.safeParse(parsed);
  if (!validation.success) {
    logger.warn({
      correlation_id: correlationId,
      event: "classify_subroute_schema_failed",
      flow,
      raw_content: rawContent.slice(0, 200),
    });
    return { ok: false, errorType: "schema_validation" };
  }

  // Stage 5: Validate subroute is in flow's valid IDs
  const validIds = subroutes.map((s) => s.id);
  if (
    validation.data.subroute !== null &&
    !validIds.includes(validation.data.subroute)
  ) {
    logger.warn({
      correlation_id: correlationId,
      event: "classify_subroute_invalid_id",
      flow,
      subroute: validation.data.subroute,
      valid_ids: validIds,
    });
    return { ok: false, errorType: "invalid_subroute" };
  }

  return { ok: true, data: validation.data };
}
