import type { FlowDefinition } from "../types";
import { handleStart } from "./steps";

export const unknownFlow: FlowDefinition = {
  id: "unknown",
  steps: { start: handleStart },
};
