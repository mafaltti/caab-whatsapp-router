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

// --- Subroute Router ---

export const SubrouteRouterSchema = z.object({
  subroute: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  reason: z.string().max(200),
});
export type SubrouteRouterResult = z.infer<typeof SubrouteRouterSchema>;

// --- Data Extraction (combined) ---

export const DataExtractionSchema = z.object({
  person_type: z.enum(["PF", "PJ"]).nullable(),
  cpf_cnpj: z.string().regex(/^\d+$/).nullable(),
  email: z.string().email().nullable(),
  phone: z.string().regex(/^\d+$/).nullable(),
  confidence: z.number().min(0).max(1),
  missing_fields: z.array(z.string()),
});
export type DataExtractionResult = z.infer<typeof DataExtractionSchema>;

// --- Individual Extraction Schemas (for step machines) ---

export const PersonTypeExtractionSchema = z.object({
  person_type: z.enum(["PF", "PJ"]).nullable(),
  confidence: z.number().min(0).max(1),
});
export type PersonTypeExtractionResult = z.infer<
  typeof PersonTypeExtractionSchema
>;

export const CpfCnpjExtractionSchema = z.object({
  cpf_cnpj: z.string().regex(/^\d+$/).nullable(),
  confidence: z.number().min(0).max(1),
});
export type CpfCnpjExtractionResult = z.infer<typeof CpfCnpjExtractionSchema>;

export const EmailExtractionSchema = z.object({
  email: z.string().email().nullable(),
  confidence: z.number().min(0).max(1),
});
export type EmailExtractionResult = z.infer<typeof EmailExtractionSchema>;

export const PhoneExtractionSchema = z.object({
  phone: z.string().regex(/^\d+$/).nullable(),
  confidence: z.number().min(0).max(1),
});
export type PhoneExtractionResult = z.infer<typeof PhoneExtractionSchema>;

export const ConfirmationExtractionSchema = z.object({
  answer: z.enum(["yes", "no", "unclear"]),
});
export type ConfirmationExtractionResult = z.infer<
  typeof ConfirmationExtractionSchema
>;

// --- Subroute Configuration ---

export interface SubrouteDefinition {
  id: string;
  description: string;
}

export const SUBROUTE_CONFIG: Record<string, SubrouteDefinition[]> = {
  digital_certificate: [
    { id: "purchase", description: "Comprar um novo certificado digital" },
    { id: "renewal", description: "Renovar certificado existente" },
    {
      id: "support",
      description: "Suporte tecnico, problemas ou duvidas tecnicas",
    },
    {
      id: "requirements",
      description: "Informacoes sobre documentos e requisitos necessarios",
    },
    { id: "status", description: "Verificar status de um pedido existente" },
  ],
  billing: [
    { id: "status", description: "Consultar status de fatura ou pagamento" },
  ],
};
