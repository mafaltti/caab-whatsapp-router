import type { StepHandler } from "../types";

export const handleStart: StepHandler = async () => {
  return {
    reply:
      "Entendi que você precisa de ajuda com faturamento! " +
      "Em breve vou te guiar pelo processo. Por enquanto, aguarde que estamos implementando o fluxo completo.",
    nextStep: "start",
    done: true,
  };
};
