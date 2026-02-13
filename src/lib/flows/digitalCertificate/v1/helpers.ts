/**
 * Shared utilities for digital certificate subroutes.
 */

import { extractConfirmation } from "@/lib/llm";
import { logger } from "@/lib/shared";

const MAX_RETRIES = 3;

// --- Protocol ID ---

export function generateProtocolId(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hex = Math.floor(Math.random() * 0xffff)
    .toString(16)
    .padStart(4, "0")
    .toUpperCase();
  return `CD-${y}${m}${d}-${hex}`;
}

// --- Retry tracking ---

export function getRetryCount(
  data: Record<string, unknown>,
  field: string,
): number {
  const key = `${field}_retry_count`;
  return typeof data[key] === "number" ? (data[key] as number) : 0;
}

export function incrementRetry(
  data: Record<string, unknown>,
  field: string,
): Record<string, unknown> {
  const key = `${field}_retry_count`;
  return { [key]: getRetryCount(data, field) + 1 };
}

export function isMaxRetriesReached(
  data: Record<string, unknown>,
  field: string,
): boolean {
  return getRetryCount(data, field) >= MAX_RETRIES;
}

// --- Human handoff ---

export const HUMAN_HANDOFF_REPLY =
  "Parece que estamos com dificuldade nesse passo. " +
  "Vou transferir você para um atendente humano que poderá te ajudar melhor. " +
  "Aguarde um momento, por favor.";

// --- Confirmation detection ---

const YES_PATTERNS =
  /\b(sim|correto|certo|ok|isso|exato|exatamente|confirmo|positivo|yes|está certo|tá certo|ta certo|por favor|pode sim|quero|claro|com certeza|pode ser)\b/i;
const NO_PATTERNS =
  /\b(não|nao|errado|incorreto|negativo|no|nope|tá errado|ta errado|está errado|não quero|nao quero)\b/i;

export async function detectConfirmation(
  text: string,
  correlationId?: string,
): Promise<"yes" | "no" | "unclear"> {
  const cleaned = text.trim().replace(/[.,!?]+$/g, "");
  if (YES_PATTERNS.test(cleaned)) return "yes";
  if (NO_PATTERNS.test(cleaned)) return "no";

  // LLM fallback for ambiguous responses (e.g. audio transcriptions)
  const result = await extractConfirmation({ text: cleaned, correlationId });
  if (result.ok) {
    logger.info({
      correlation_id: correlationId,
      event: "confirmation_llm_fallback",
      answer: result.data.answer,
    });
    return result.data.answer;
  }

  return "unclear";
}

// --- Field correction detection ---

const FIELD_KEYWORDS: Record<string, string[]> = {
  person_type: ["tipo", "pessoa", "pf", "pj", "fisica", "juridica"],
  cpf_cnpj: ["cpf", "cnpj", "documento"],
  email: ["email", "e-mail", "correio"],
  phone: ["telefone", "celular", "fone", "tel", "ddd"],
};

export const FIELD_TO_STEP: Record<string, string> = {
  person_type: "ask_person_type",
  cpf_cnpj: "ask_cpf_cnpj",
  email: "ask_email",
  phone: "ask_phone",
};

const FIELD_ORDER = ["person_type", "cpf_cnpj", "email", "phone"];

export function detectFieldToCorrect(text: string): string | null {
  const lower = text.trim().toLowerCase();

  // Numeric selection (1-4)
  const num = parseInt(lower, 10);
  if (num >= 1 && num <= 4) {
    return FIELD_ORDER[num - 1];
  }

  // Keyword match (word boundaries prevent "pf" matching inside "cpf")
  for (const [field, keywords] of Object.entries(FIELD_KEYWORDS)) {
    for (const kw of keywords) {
      if (new RegExp(`\\b${kw}\\b`).test(lower)) return field;
    }
  }

  return null;
}

// --- Formatting ---

const PERSON_TYPE_LABEL: Record<string, string> = {
  PF: "Pessoa Física",
  PJ: "Pessoa Jurídica",
};

function formatCpfCnpj(digits: string, personType: string): string {
  if (personType === "PF" && digits.length === 11) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }
  if (personType === "PJ" && digits.length === 14) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  }
  return digits;
}

function formatPhone(digits: string): string {
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return digits;
}

export function formatPurchaseSummary(data: Record<string, unknown>): string {
  const pt = (data.person_type as string) ?? "—";
  const doc = (data.cpf_cnpj as string) ?? "—";
  const email = (data.email as string) ?? "—";
  const phone = (data.phone as string) ?? "—";

  return (
    "Confira seus dados:\n\n" +
    `1. Tipo: ${PERSON_TYPE_LABEL[pt] ?? pt}\n` +
    `2. ${pt === "PJ" ? "CNPJ" : "CPF"}: ${formatCpfCnpj(doc, pt)}\n` +
    `3. Email: ${email}\n` +
    `4. Telefone: ${formatPhone(phone)}\n\n` +
    "Está tudo correto?"
  );
}

export function formatRenewalSummary(data: Record<string, unknown>): string {
  const orderId = (data.order_id as string) ?? "—";
  const email = (data.email as string) ?? "—";

  return (
    "Confira seus dados de renovação:\n\n" +
    `• Pedido: ${orderId}\n` +
    `• Email: ${email}\n\n` +
    "Está tudo correto?"
  );
}

export function formatSupportSummary(data: Record<string, unknown>): string {
  const problem = (data.problem_description as string) ?? "—";
  const orderId = (data.order_id as string | null) ?? "não informado";

  return (
    "Confira os dados do seu chamado:\n\n" +
    `• Problema: ${problem}\n` +
    `• Pedido: ${orderId}\n\n` +
    "Está tudo correto?"
  );
}
