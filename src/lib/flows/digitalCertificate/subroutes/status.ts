import type { StepHandler } from "../../types";
import {
  incrementRetry,
  isMaxRetriesReached,
  HUMAN_HANDOFF_REPLY,
} from "../helpers";

// --- Mock status lookup ---

interface OrderStatus {
  status: string;
  detail: string;
}

function getMockOrderStatus(orderId: string): OrderStatus {
  const lastDigit = orderId.charAt(orderId.length - 1);
  const digit = parseInt(lastDigit, 10);

  if (isNaN(digit) || digit <= 3) {
    return {
      status: "Em processamento",
      detail: "Seu pedido está sendo analisado pela equipe. Previsão: 2 dias úteis.",
    };
  }
  if (digit <= 6) {
    return {
      status: "Aguardando validação",
      detail: "Estamos aguardando a validação dos seus documentos. Você receberá um email com instruções.",
    };
  }
  return {
    status: "Concluído",
    detail: "Seu certificado já foi emitido! Verifique seu email para instruções de instalação.",
  };
}

// --- ask_order_id ---

export const handleAskOrderId: StepHandler = async (ctx) => {
  const { state, message } = ctx;

  if (!state.data._asked_order_id) {
    return {
      reply: "Para consultar o status, preciso do número do seu pedido ou protocolo.",
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
      reply: "O número informado parece muito curto. Por favor, envie o número completo do pedido ou protocolo.",
      nextStep: "ask_order_id",
      data: incrementRetry(state.data, "order_id"),
    };
  }

  const { status, detail } = getMockOrderStatus(text);

  return {
    reply:
      `Encontrei seu pedido *${text}*:\n\n` +
      `*Status:* ${status}\n` +
      `${detail}\n\n` +
      `Se precisar de mais alguma coisa, é só enviar uma mensagem!`,
    nextStep: "ask_order_id",
    data: { order_id: text, _asked_order_id: false },
    done: true,
  };
};
