/**
 * Shared utilities for general support flow.
 */

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
  /^(sim|s|correto|certo|ok|isso|exato|confirmo|positivo|yes|y|está certo|tá certo|ta certo)$/i;
const NO_PATTERNS =
  /^(não|nao|n|errado|incorreto|negativo|no|nope|tá errado|ta errado|está errado)$/i;

export function detectConfirmation(text: string): "yes" | "no" | "unclear" {
  const trimmed = text.trim();
  if (YES_PATTERNS.test(trimmed)) return "yes";
  if (NO_PATTERNS.test(trimmed)) return "no";
  return "unclear";
}
