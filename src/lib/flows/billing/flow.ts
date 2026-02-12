import type { FlowDefinition } from "../types";
import { handleStart } from "./steps";

export const billingFlow: FlowDefinition = {
  id: "billing",
  steps: { start: handleStart },
};
