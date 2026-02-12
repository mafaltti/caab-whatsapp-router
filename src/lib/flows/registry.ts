import type { FlowDefinition } from "./types";
import { unknownFlow } from "./unknown/flow";
import { generalSupportFlow } from "./generalSupport/flow";
import { digitalCertificateFlow } from "./digitalCertificate/flow";
import { billingFlow } from "./billing/flow";

const FLOW_REGISTRY: Record<string, FlowDefinition> = {
  unknown: unknownFlow,
  general_support: generalSupportFlow,
  digital_certificate: digitalCertificateFlow,
  billing: billingFlow,
};

export function getFlowDefinition(flowId: string): FlowDefinition | null {
  return FLOW_REGISTRY[flowId] ?? null;
}
