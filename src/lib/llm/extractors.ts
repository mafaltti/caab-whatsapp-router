import type { ZodType } from "zod/v4";
import { logger, extractDigits, normalizeSpokenEmail } from "@/lib/shared";
import {
  DataExtractionSchema,
  type DataExtractionResult,
  PersonTypeExtractionSchema,
  type PersonTypeExtractionResult,
  CpfCnpjExtractionSchema,
  type CpfCnpjExtractionResult,
  EmailExtractionSchema,
  type EmailExtractionResult,
  PhoneExtractionSchema,
  type PhoneExtractionResult,
} from "./schemas";
import {
  dataExtractionSystemPrompt,
  dataExtractionUserPrompt,
  personTypeExtractionSystemPrompt,
  personTypeExtractionUserPrompt,
  cpfCnpjExtractionSystemPrompt,
  cpfCnpjExtractionUserPrompt,
  emailExtractionSystemPrompt,
  emailExtractionUserPrompt,
  phoneExtractionSystemPrompt,
  phoneExtractionUserPrompt,
} from "./prompts";
import { callLlm, SafetyOverrideError } from "./client";

export type ExtractionErrorType =
  | "llm_error"
  | "invalid_json"
  | "schema_validation";

type ExtractResult<T> =
  | { ok: true; data: T }
  | { ok: false; errorType: ExtractionErrorType };

// --- Generic helper ---

async function extractWithLlm<T>(options: {
  systemPrompt: string;
  userPrompt: string;
  schema: ZodType;
  eventPrefix: string;
  correlationId?: string;
}): Promise<ExtractResult<T>> {
  const { systemPrompt, userPrompt, schema, eventPrefix, correlationId } =
    options;

  // Call LLM
  let rawContent: string;
  try {
    const result = await callLlm({
      systemPrompt,
      userPrompt,
      correlationId,
      maxTokens: 200,
    });
    rawContent = result.content;
  } catch (err) {
    if (err instanceof SafetyOverrideError) throw err;
    logger.error({
      correlation_id: correlationId,
      event: `${eventPrefix}_llm_error`,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, errorType: "llm_error" };
  }

  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    logger.warn({
      correlation_id: correlationId,
      event: `${eventPrefix}_invalid_json`,
      raw_content: rawContent.slice(0, 200),
    });
    return { ok: false, errorType: "invalid_json" };
  }

  // Validate schema
  const validation = schema.safeParse(parsed);
  if (!validation.success) {
    logger.warn({
      correlation_id: correlationId,
      event: `${eventPrefix}_schema_failed`,
      raw_content: rawContent.slice(0, 200),
    });
    return { ok: false, errorType: "schema_validation" };
  }

  return { ok: true, data: validation.data as T };
}

// --- Individual Extractors ---

export async function extractPersonType(options: {
  text: string;
  correlationId?: string;
}): Promise<ExtractResult<PersonTypeExtractionResult>> {
  return extractWithLlm<PersonTypeExtractionResult>({
    systemPrompt: personTypeExtractionSystemPrompt(),
    userPrompt: personTypeExtractionUserPrompt(options.text),
    schema: PersonTypeExtractionSchema,
    eventPrefix: "extract_person_type",
    correlationId: options.correlationId,
  });
}

export async function extractCpfCnpj(options: {
  text: string;
  expectedType?: "PF" | "PJ" | null;
  correlationId?: string;
}): Promise<ExtractResult<CpfCnpjExtractionResult>> {
  // Fast path: try direct digit extraction (handles spoken numbers from audio)
  const digits = extractDigits(options.text);
  const expectedLen = options.expectedType === "PJ" ? 14 : 11;
  if (digits.length === expectedLen) {
    logger.info({
      correlation_id: options.correlationId,
      event: "extract_cpf_cnpj_fast_path",
      digit_count: digits.length,
    });
    return { ok: true, data: { cpf_cnpj: digits, confidence: 0.95 } };
  }

  return extractWithLlm<CpfCnpjExtractionResult>({
    systemPrompt: cpfCnpjExtractionSystemPrompt(
      options.expectedType ?? null,
    ),
    userPrompt: cpfCnpjExtractionUserPrompt(options.text),
    schema: CpfCnpjExtractionSchema,
    eventPrefix: "extract_cpf_cnpj",
    correlationId: options.correlationId,
  });
}

export async function extractEmail(options: {
  text: string;
  correlationId?: string;
}): Promise<ExtractResult<EmailExtractionResult>> {
  // Fast path: normalize spoken email patterns (arroba → @, ponto → .)
  const normalized = normalizeSpokenEmail(options.text);
  const emailMatch = normalized.match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
  if (emailMatch) {
    logger.info({
      correlation_id: options.correlationId,
      event: "extract_email_fast_path",
    });
    return { ok: true, data: { email: emailMatch[0], confidence: 0.9 } };
  }

  return extractWithLlm<EmailExtractionResult>({
    systemPrompt: emailExtractionSystemPrompt(),
    userPrompt: emailExtractionUserPrompt(options.text),
    schema: EmailExtractionSchema,
    eventPrefix: "extract_email",
    correlationId: options.correlationId,
  });
}

export async function extractPhone(options: {
  text: string;
  correlationId?: string;
}): Promise<ExtractResult<PhoneExtractionResult>> {
  // Fast path: try direct digit extraction (handles spoken numbers from audio)
  const digits = extractDigits(options.text);
  if (digits.length >= 10 && digits.length <= 11) {
    logger.info({
      correlation_id: options.correlationId,
      event: "extract_phone_fast_path",
      digit_count: digits.length,
    });
    return { ok: true, data: { phone: digits, confidence: 0.95 } };
  }

  return extractWithLlm<PhoneExtractionResult>({
    systemPrompt: phoneExtractionSystemPrompt(),
    userPrompt: phoneExtractionUserPrompt(options.text),
    schema: PhoneExtractionSchema,
    eventPrefix: "extract_phone",
    correlationId: options.correlationId,
  });
}

// --- Combined Extractor ---

export async function extractData(options: {
  text: string;
  correlationId?: string;
}): Promise<ExtractResult<DataExtractionResult>> {
  return extractWithLlm<DataExtractionResult>({
    systemPrompt: dataExtractionSystemPrompt(),
    userPrompt: dataExtractionUserPrompt(options.text),
    schema: DataExtractionSchema,
    eventPrefix: "extract_data",
    correlationId: options.correlationId,
  });
}
