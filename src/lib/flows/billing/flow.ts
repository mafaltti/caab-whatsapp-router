import type { FlowDefinition } from "../types";
import { handleStart } from "./steps";
import { handleAskInvoiceId } from "./subroutes/status";

export const billingFlow: FlowDefinition = {
  id: "billing",
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
