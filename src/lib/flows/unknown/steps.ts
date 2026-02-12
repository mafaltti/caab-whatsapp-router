import type { StepHandler } from "../types";

export const handleStart: StepHandler = async () => {
  return {
    reply:
      "Olá! Como posso te ajudar?\n\n" +
      "1️⃣ Certificado Digital\n" +
      "2️⃣ Faturamento\n" +
      "3️⃣ Suporte Geral",
    nextStep: "start",
    done: true,
  };
};
