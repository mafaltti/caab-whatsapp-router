import type { FlowDefinition } from "../../types";
import {
  handleStart,
  handleAwaitingProblem,
  handleAwaitingHandoff,
} from "./steps";

export const generalSupportFlowV1: FlowDefinition = {
  id: "general_support",
  version: "v1",
  active: true,
  steps: {
    start: handleStart,
    awaiting_problem: handleAwaitingProblem,
    awaiting_handoff: handleAwaitingHandoff,
  },
};
