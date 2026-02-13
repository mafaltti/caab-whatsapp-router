import { callLlm } from "@/lib/llm/client";
import {
  generalSupportSummarySystemPrompt,
  generalSupportSummaryUserPrompt,
} from "@/lib/llm/prompts";
import { logger } from "@/lib/shared";
import type { StepHandler } from "../../types";
import { generateProtocolId, detectConfirmation } from "./helpers";

export const handleStart: StepHandler = async () => {
  return {
    reply: "Como posso ajudar você?\n\nPor favor, descreva sua dúvida ou problema.",
    nextStep: "awaiting_problem",
  };
};

export const handleAwaitingProblem: StepHandler = async (ctx) => {
  const problem = ctx.message.text;

  let summary: string;
  try {
    const result = await callLlm({
      systemPrompt: generalSupportSummarySystemPrompt(),
      userPrompt: generalSupportSummaryUserPrompt(problem),
      correlationId: ctx.correlationId,
      jsonMode: false,
      maxTokens: 100,
    });
    summary = result.content.trim();
    if (!summary) {
      summary = problem.length > 50 ? problem.slice(0, 50) + "..." : problem;
    }
  } catch (err) {
    logger.error({
      correlation_id: ctx.correlationId,
      event: "general_support_summary_error",
      error: err instanceof Error ? err.message : String(err),
    });
    summary = problem.length > 50 ? problem.slice(0, 50) + "..." : problem;
  }

  return {
    reply:
      `Entendo que você precisa de ajuda com *${summary}*.\n\n` +
      "Para melhor atendê-lo, posso transferir você para um atendente humano.\n\n" +
      "Deseja falar com um atendente? (sim/não)",
    nextStep: "awaiting_handoff",
    data: { problem, summary },
  };
};

export const handleAwaitingHandoff: StepHandler = async (ctx) => {
  const confirmation = await detectConfirmation(ctx.message.text, ctx.correlationId);

  if (confirmation === "yes") {
    const protocolId = generateProtocolId();
    return {
      reply:
        "Entendido! Vou transferir você para um atendente humano.\n\n" +
        `Seu protocolo de atendimento: *${protocolId}*\n\n` +
        "Um atendente entrará em contato em breve pelo WhatsApp.",
      nextStep: "done",
      data: {
        protocol_id: protocolId,
        handoff_requested: true,
        handoff_at: new Date().toISOString(),
      },
      done: true,
    };
  }

  if (confirmation === "no") {
    return {
      reply: "Obrigado! Se precisar de mais ajuda, é só me chamar.",
      nextStep: "done",
      done: true,
    };
  }

  // unclear
  return {
    reply: "Por favor, responda sim ou não. Deseja falar com um atendente?",
    nextStep: "awaiting_handoff",
  };
};
