import type { FlowDefinition } from "../types";
import { handleStart } from "./steps";

export const digitalCertificateFlow: FlowDefinition = {
  id: "digital_certificate",
  steps: { start: handleStart },
};
