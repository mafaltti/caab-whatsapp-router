import type { FlowDefinition } from "../../types";
import { handleStart } from "./steps";
import { handleAskInvoiceId } from "./subroutes/status";

export const billingFlowV1: FlowDefinition = {
  id: "billing",
  version: "v1",
  active: true,
  steps: { start: handleStart },
  subroutes: {
    status: {
      entryStep: "ask_invoice_id",
      steps: {
        ask_invoice_id: handleAskInvoiceId,
      },
    },
  },
};
