import type { StepHandler } from "../types";

export const handleStart: StepHandler = async () => {
  return {
    reply:
      "Posso te ajudar com faturamento! Vou consultar o status da sua fatura.\n\n" +
      "Me conte o que você precisa.",
    nextStep: "start",
  };
};
