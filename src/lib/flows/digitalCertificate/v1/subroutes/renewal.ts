import type { StepHandler } from "../../../types";
import { CONFIDENCE_ACCEPT } from "@/lib/llm/schemas";
import { extractEmail } from "@/lib/llm/extractors";
import { isValidEmail } from "../validation";
import {
  incrementRetry,
  isMaxRetriesReached,
  HUMAN_HANDOFF_REPLY,
  detectConfirmation,
  formatRenewalSummary,
  generateProtocolId,
} from "../helpers";

// --- ask_order_id ---

export const handleAskOrderId: StepHandler = async (ctx) => {
  const { state, message } = ctx;

  if (!state.data._asked_order_id) {
    return {
      reply: "Para renovar seu certificado, preciso do número do pedido ou protocolo anterior.",
      nextStep: "ask_order_id",
      data: { _asked_order_id: true },
    };
  }

  if (isMaxRetriesReached(state.data, "order_id")) {
    return { reply: HUMAN_HANDOFF_REPLY, nextStep: "ask_order_id", done: true };
  }

  const text = message.text.trim();
  if (text.length < 3) {
    return {
      reply: "O número informado parece muito curto. Por favor, envie o número do pedido ou protocolo.",
      nextStep: "ask_order_id",
      data: incrementRetry(state.data, "order_id"),
    };
  }

  return {
    reply: "Pedido registrado! Qual seu email para contato sobre a renovação?",
    nextStep: "ask_email",
    data: {
      order_id: text,
      _asked_order_id: false,
      order_id_retry_count: 0,
    },
  };
};

// --- ask_email ---

export const handleAskEmail: StepHandler = async (ctx) => {
  const { state, message, correlationId } = ctx;

  if (!state.data._asked_email) {
    return {
      reply: "Qual seu email para contato?",
      nextStep: "ask_email",
      data: { _asked_email: true },
    };
  }

  if (isMaxRetriesReached(state.data, "email")) {
    return { reply: HUMAN_HANDOFF_REPLY, nextStep: "ask_email", done: true };
  }

  const result = await extractEmail({ text: message.text, correlationId });

  if (
    !result.ok ||
    !result.data.email ||
    result.data.confidence < CONFIDENCE_ACCEPT
  ) {
    return {
      reply: "Não consegui identificar um email válido. Por favor, envie seu email (ex: nome@empresa.com).",
      nextStep: "ask_email",
      data: incrementRetry(state.data, "email"),
    };
  }

  if (!isValidEmail(result.data.email)) {
    return {
      reply: "O email informado parece inválido. Envie um email válido (ex: nome@empresa.com).",
      nextStep: "ask_email",
      data: incrementRetry(state.data, "email"),
    };
  }

  return {
    reply: formatRenewalSummary({ ...state.data, email: result.data.email }),
    nextStep: "confirm",
    data: {
      email: result.data.email,
      _asked_email: false,
      email_retry_count: 0,
    },
  };
};

// --- confirm ---

export const handleConfirm: StepHandler = async (ctx) => {
  const { message } = ctx;
  const answer = detectConfirmation(message.text);

  if (answer === "yes") {
    const protocol = generateProtocolId();
    return {
      reply:
        `Sua solicitação de renovação foi registrada!\n\n` +
        `Protocolo: *${protocol}*\n\n` +
        `Nossa equipe analisará seu pedido e entrará em contato pelo email informado. Obrigado!`,
      nextStep: "confirm",
      data: { protocol_id: protocol },
      done: true,
    };
  }

  if (answer === "no") {
    return {
      reply: "Sem problemas, vamos recomeçar. Para renovar seu certificado, preciso do número do pedido ou protocolo anterior.",
      nextStep: "ask_order_id",
      data: {
        order_id: null,
        email: null,
        _asked_order_id: true,
        _asked_email: false,
      },
    };
  }

  return {
    reply: "Por favor, responda *sim* para confirmar ou *não* para recomeçar.",
    nextStep: "confirm",
  };
};
