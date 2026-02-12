import { logger } from "@/lib/shared";
import type { ChatMessage } from "@/lib/db";
import {
  GlobalRouterSchema,
  type GlobalRouterResult,
  type FlowType,
  CONFIDENCE_ACCEPT,
} from "./schemas";
import { topicShiftSystemPrompt, topicShiftUserPrompt } from "./prompts";
import { callLlm } from "./client";

// --- Tier 1: Rule-based keyword matching ---

const KEYWORD_MAP: Record<string, FlowType> = {};

const DIGITAL_CERTIFICATE_KEYWORDS = [
  "certificado digital",
  "e-cpf",
  "e-cnpj",
  "ecpf",
  "ecnpj",
  "certificado a1",
  "certificado a3",
  "certificado e-cpf",
  "certificado e-cnpj",
];

const BILLING_KEYWORDS = [
  "boleto",
  "fatura",
  "pagamento",
  "cobranca",
  "nota fiscal",
  "segunda via",
  "financeiro",
  "nf-e",
  "nfe",
];

const SUPPORT_KEYWORDS = [
  "atendente",
  "humano",
  "falar com alguem",
  "falar com uma pessoa",
  "suporte",
  "falar com alguém",
];

for (const kw of DIGITAL_CERTIFICATE_KEYWORDS) KEYWORD_MAP[kw] = "digital_certificate";
for (const kw of BILLING_KEYWORDS) KEYWORD_MAP[kw] = "billing";
for (const kw of SUPPORT_KEYWORDS) KEYWORD_MAP[kw] = "general_support";

function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function matchKeyword(text: string): FlowType | null {
  const normalized = stripAccents(text.toLowerCase().trim());

  for (const [keyword, flow] of Object.entries(KEYWORD_MAP)) {
    const normalizedKeyword = stripAccents(keyword);
    if (normalized.includes(normalizedKeyword)) {
      return flow;
    }
  }

  return null;
}

// --- Tier 2: LLM fallback ---

interface DetectTopicShiftOptions {
  text: string;
  currentFlow: string;
  chatHistory: ChatMessage[];
  correlationId?: string;
}

export async function detectTopicShift(
  options: DetectTopicShiftOptions,
): Promise<GlobalRouterResult | null> {
  const { text, currentFlow, chatHistory, correlationId } = options;

  // Tier 1: keyword check
  const keywordFlow = matchKeyword(text);

  if (keywordFlow) {
    if (keywordFlow === currentFlow) {
      return null; // same flow, no shift
    }

    logger.info({
      correlation_id: correlationId,
      event: "topic_shift_keyword_detected",
      from_flow: currentFlow,
      to_flow: keywordFlow,
    });

    return {
      flow: keywordFlow,
      confidence: 0.95,
      reason: `Keyword match: "${text.slice(0, 50)}"`,
    };
  }

  // Tier 2: LLM fallback
  try {
    const result = await callLlm({
      systemPrompt: topicShiftSystemPrompt(),
      userPrompt: topicShiftUserPrompt(text, currentFlow, chatHistory),
      correlationId,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(result.content);
    } catch {
      logger.warn({
        correlation_id: correlationId,
        event: "topic_shift_invalid_json",
        raw_content: result.content.slice(0, 200),
      });
      return null; // favor continuity
    }

    const validation = GlobalRouterSchema.safeParse(parsed);

    if (!validation.success) {
      logger.warn({
        correlation_id: correlationId,
        event: "topic_shift_schema_validation_failed",
      });
      return null;
    }

    const { flow, confidence } = validation.data;

    // Only shift if clearly different flow with high confidence
    if (
      flow !== currentFlow &&
      flow !== "unknown" &&
      confidence >= CONFIDENCE_ACCEPT
    ) {
      logger.info({
        correlation_id: correlationId,
        event: "topic_shift_llm_detected",
        from_flow: currentFlow,
        to_flow: flow,
        confidence,
      });
      return validation.data;
    }

    return null; // favor continuity
  } catch {
    return null; // on error, stay in current flow
  }
}
