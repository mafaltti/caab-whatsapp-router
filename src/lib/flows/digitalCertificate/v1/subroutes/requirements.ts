import type { StepHandler } from "../../../types";
import { detectConfirmation } from "../helpers";

// --- show_info ---

export const handleShowInfo: StepHandler = async () => {
  return {
    reply:
      "Aqui estão os requisitos para emissão de certificado digital:\n\n" +
      "*Pessoa Física (e-CPF):*\n" +
      "• Documento de identidade (RG ou CNH)\n" +
      "• CPF\n" +
      "• Comprovante de endereço recente\n\n" +
      "*Pessoa Jurídica (e-CNPJ):*\n" +
      "• Contrato social ou estatuto atualizado\n" +
      "• Cartão CNPJ\n" +
      "• Documento do responsável legal (RG ou CNH)\n" +
      "• Comprovante de endereço da empresa\n\n" +
      "Gostaria de iniciar uma compra de certificado?",
    nextStep: "offer_purchase",
    data: { _asked_offer_purchase: true },
  };
};

// --- offer_purchase ---

export const handleOfferPurchase: StepHandler = async (ctx) => {
  const { message } = ctx;
  const answer = detectConfirmation(message.text);

  if (answer === "yes") {
    return {
      reply: "Ótimo! Envie uma nova mensagem dizendo que gostaria de comprar um certificado e vamos iniciar o processo.",
      nextStep: "offer_purchase",
      done: true,
    };
  }

  if (answer === "no") {
    return {
      reply: "Tudo bem! Se precisar de algo mais, é só enviar uma mensagem. Até logo!",
      nextStep: "offer_purchase",
      done: true,
    };
  }

  return {
    reply: "Gostaria de iniciar uma compra de certificado? Responda *sim* ou *não*.",
    nextStep: "offer_purchase",
  };
};
