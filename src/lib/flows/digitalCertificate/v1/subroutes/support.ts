import type { StepHandler } from "../../../types";
import {
  incrementRetry,
  isMaxRetriesReached,
  HUMAN_HANDOFF_REPLY,
  detectConfirmation,
  formatSupportSummary,
  generateProtocolId,
} from "../helpers";

// --- ask_problem ---

export const handleAskProblem: StepHandler = async (ctx) => {
  const { state, message } = ctx;

  if (!state.data._asked_problem) {
    return {
      reply: "Entendi que você precisa de suporte técnico. Por favor, descreva o problema que está enfrentando.",
      nextStep: "ask_problem",
      data: { _asked_problem: true },
    };
  }

  if (isMaxRetriesReached(state.data, "problem")) {
    return { reply: HUMAN_HANDOFF_REPLY, nextStep: "ask_problem", done: true };
  }

  const text = message.text.trim();
  if (text.length < 5) {
    return {
      reply: "Poderia descrever o problema com mais detalhes para que possamos te ajudar melhor?",
      nextStep: "ask_problem",
      data: incrementRetry(state.data, "problem"),
    };
  }

  return {
    reply:
      "Obrigado pela descrição. Você tem um número de pedido ou protocolo relacionado? " +
      "Se não tiver, responda *não*.",
    nextStep: "ask_order_id",
    data: {
      problem_description: text,
      _asked_problem: false,
      _asked_order_id: true,
      problem_retry_count: 0,
    },
  };
};

// --- ask_order_id ---

export const handleAskOrderId: StepHandler = async (ctx) => {
  const { state, message } = ctx;

  if (!state.data._asked_order_id) {
    return {
      reply: "Você tem um número de pedido ou protocolo? Se não tiver, responda *não*.",
      nextStep: "ask_order_id",
      data: { _asked_order_id: true },
    };
  }

  const text = message.text.trim().toLowerCase();
  const isSkip = /^(não|nao|n|no|nope|nenhum|não tenho|nao tenho)$/i.test(text);

  if (isSkip) {
    return {
      reply: formatSupportSummary({ ...state.data, order_id: null }),
      nextStep: "confirm",
      data: { order_id: null, _asked_order_id: false },
    };
  }

  if (text.length < 3) {
    return {
      reply: "O número informado parece muito curto. Envie o número do pedido ou responda *não* se não tiver.",
      nextStep: "ask_order_id",
    };
  }

  return {
    reply: formatSupportSummary({ ...state.data, order_id: text }),
    nextStep: "confirm",
    data: { order_id: text, _asked_order_id: false },
  };
};

// --- confirm ---

export const handleConfirm: StepHandler = async (ctx) => {
  const { message } = ctx;
  const answer = await detectConfirmation(message.text, ctx.correlationId);

  if (answer === "yes") {
    const protocol = generateProtocolId();
    return {
      reply:
        `Seu chamado de suporte foi aberto com sucesso!\n\n` +
        `Protocolo: *${protocol}*\n\n` +
        `Um técnico entrará em contato em breve para te ajudar. Obrigado pela paciência!`,
      nextStep: "confirm",
      data: { protocol_id: protocol },
      done: true,
    };
  }

  if (answer === "no") {
    return {
      reply: "Sem problemas, vamos recomeçar. Por favor, descreva o problema que está enfrentando.",
      nextStep: "ask_problem",
      data: {
        problem_description: null,
        order_id: null,
        _asked_problem: true,
        _asked_order_id: false,
      },
    };
  }

  return {
    reply: "Desculpe, não entendi. Os dados estão corretos?",
    nextStep: "confirm",
  };
};
