import type { FlowDefinition } from "../types";
import { handleStart, handleAwaitingReply } from "./steps";

export const unknownFlow: FlowDefinition = {
  id: "unknown",
  steps: { start: handleStart, awaiting_reply: handleAwaitingReply },
};
