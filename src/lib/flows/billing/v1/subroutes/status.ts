import type { StepHandler } from "../../../types";
import {
  getMockInvoiceStatus,
  formatInvoiceResponse,
  incrementRetry,
  isMaxRetriesReached,
  HUMAN_HANDOFF_REPLY,
} from "../helpers";

// --- ask_invoice_id ---

export const handleAskInvoiceId: StepHandler = async (ctx) => {
  const { state, message } = ctx;

  if (!state.data._asked_invoice_id) {
    return {
      reply:
        "Para consultar sua fatura, preciso do número da nota fiscal ou do pedido.\n\n" +
        "Pode me enviar?",
      nextStep: "ask_invoice_id",
      data: { _asked_invoice_id: true },
    };
  }

  if (isMaxRetriesReached(state.data, "invoice_id")) {
    return { reply: HUMAN_HANDOFF_REPLY, nextStep: "ask_invoice_id", done: true };
  }

  const text = message.text.trim();
  if (text.length < 3) {
    return {
      reply:
        "O número informado parece muito curto. Por favor, envie o número completo da nota fiscal ou pedido.",
      nextStep: "ask_invoice_id",
      data: incrementRetry(state.data, "invoice_id"),
    };
  }

  const invoice = getMockInvoiceStatus(text);

  return {
    reply:
      formatInvoiceResponse(text, invoice) +
      "\n\nSe precisar de mais alguma coisa, é só enviar uma mensagem!",
    nextStep: "ask_invoice_id",
    data: { invoice_id: text, _asked_invoice_id: false },
    done: true,
  };
};
