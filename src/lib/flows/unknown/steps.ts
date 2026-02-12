import type { ChatMessage } from "@/lib/db";
import { callLlm, classifyFlow, CONFIDENCE_ACCEPT } from "@/lib/llm";
import {
  unknownConversationSystemPrompt,
  unknownConversationUserPrompt,
} from "@/lib/llm/prompts";
import { logger } from "@/lib/shared";
import type { StepHandler } from "../types";

const STATIC_MENU =
  "Como posso te ajudar?\n\n" +
  "1️⃣ Certificado Digital\n" +
  "2️⃣ Faturamento\n" +
  "3️⃣ Suporte Geral";

const MAX_TURNS = 5;

async function getConversationalReply(
  text: string,
  chatHistory: ChatMessage[],
  correlationId: string,
  turnCount: number,
): Promise<string | null> {
  try {
    const result = await callLlm({
      systemPrompt: unknownConversationSystemPrompt(),
      userPrompt: unknownConversationUserPrompt(text, chatHistory, turnCount),
      correlationId,
    });
    const parsed: unknown = JSON.parse(result.content);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "reply" in parsed &&
      typeof (parsed as Record<string, unknown>).reply === "string"
    ) {
      return (parsed as Record<string, unknown>).reply as string;
    }
    return null;
  } catch (err) {
    logger.warn({
      correlation_id: correlationId,
      event: "unknown_conversation_llm_error",
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export const handleStart: StepHandler = async (ctx) => {
  const { message, chatHistory, correlationId } = ctx;

  const llmReply = await getConversationalReply(
    message.text,
    chatHistory,
    correlationId,
    1,
  );

  if (!llmReply) {
    return { reply: STATIC_MENU, nextStep: "start", done: true };
  }

  const classification = await classifyFlow({
    text: message.text,
    chatHistory,
    correlationId,
  });

  if (
    classification.ok &&
    classification.data.flow !== "unknown" &&
    classification.data.confidence >= CONFIDENCE_ACCEPT
  ) {
    return {
      reply: llmReply,
      nextStep: "start",
      data: { _handoff_flow: classification.data.flow },
      done: false,
    };
  }

  return {
    reply: llmReply,
    nextStep: "awaiting_reply",
    data: { _turn_count: 1 },
  };
};

export const handleAwaitingReply: StepHandler = async (ctx) => {
  const { state, message, chatHistory, correlationId } = ctx;
  const turnCount = (state.data._turn_count as number) ?? 0;

  const llmReply = await getConversationalReply(
    message.text,
    chatHistory,
    correlationId,
    turnCount + 1,
  );

  if (!llmReply) {
    return { reply: STATIC_MENU, nextStep: "start", done: true };
  }

  const classification = await classifyFlow({
    text: message.text,
    chatHistory,
    correlationId,
  });

  if (
    classification.ok &&
    classification.data.flow !== "unknown" &&
    classification.data.confidence >= CONFIDENCE_ACCEPT
  ) {
    return {
      reply: llmReply,
      nextStep: "start",
      data: { _handoff_flow: classification.data.flow },
      done: false,
    };
  }

  if (turnCount + 1 >= MAX_TURNS) {
    return { reply: STATIC_MENU, nextStep: "start", done: true };
  }

  return {
    reply: llmReply,
    nextStep: "awaiting_reply",
    data: { _turn_count: turnCount + 1 },
  };
};
