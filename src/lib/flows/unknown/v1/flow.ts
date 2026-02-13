import type { FlowDefinition } from "../../types";
import { handleStart, handleAwaitingReply } from "./steps";

export const unknownFlowV1: FlowDefinition = {
  id: "unknown",
  version: "v1",
  active: true,
  steps: { start: handleStart, awaiting_reply: handleAwaitingReply },
};
