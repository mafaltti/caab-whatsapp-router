import type { FlowDefinition } from "../types";
import { handleStart, handleAwaitingProblem } from "./steps";

export const generalSupportFlow: FlowDefinition = {
  id: "general_support",
  steps: {
    start: handleStart,
    awaiting_problem: handleAwaitingProblem,
  },
};
