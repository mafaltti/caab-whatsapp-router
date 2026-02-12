import { z } from "zod/v4";

export const FLOW_VALUES = [
  "digital_certificate",
  "billing",
  "general_support",
  "unknown",
] as const;

export type FlowType = (typeof FLOW_VALUES)[number];

export const GlobalRouterSchema = z.object({
  flow: z.enum(FLOW_VALUES),
  confidence: z.number().min(0).max(1),
  reason: z.string().max(200),
});

export type GlobalRouterResult = z.infer<typeof GlobalRouterSchema>;

export const CONFIDENCE_ACCEPT = 0.8;
export const CONFIDENCE_CLARIFY = 0.6;
