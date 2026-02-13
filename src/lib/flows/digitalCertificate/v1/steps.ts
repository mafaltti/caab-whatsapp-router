import type { StepHandler } from "../../types";

export const handleStart: StepHandler = async () => {
  return {
    reply:
      "Posso te ajudar com certificado digital! Você gostaria de:\n\n" +
      "• *Comprar* um novo certificado\n" +
      "• *Renovar* um certificado existente\n" +
      "• Verificar *status* de um pedido\n" +
      "• Saber os *requisitos* necessários\n" +
      "• *Suporte* técnico\n\n" +
      "Como posso te ajudar?",
    nextStep: "start",
  };
};
