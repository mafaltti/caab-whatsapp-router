/**
 * Shared utilities for general support flow.
 */

import { extractConfirmation } from "@/lib/llm";
import { logger } from "@/lib/shared";

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
  return `GS-${y}${m}${d}-${hex}`;
}

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
