import type { StepHandler } from "../types";

export const handleStart: StepHandler = async () => {
  return {
    reply: "Entendi que você precisa de suporte. Pode me descrever qual é o problema?",
    nextStep: "awaiting_problem",
  };
};

export const handleAwaitingProblem: StepHandler = async (ctx) => {
  const problem = ctx.message.text;

  return {
    reply:
      `Obrigado por explicar! Vou encaminhar seu caso para um atendente.\n\n` +
      `Resumo: "${problem.length > 100 ? problem.slice(0, 100) + "..." : problem}"`,
    nextStep: "done",
    data: { problem, handoff_at: new Date().toISOString() },
    done: true,
  };
};
