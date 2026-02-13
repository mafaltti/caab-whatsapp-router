/**
 * Converts spoken Portuguese number words to digits.
 * Handles common patterns from Whisper audio transcription.
 *
 * Examples:
 *   "um dois três" → "1 2 3"
 *   "meia nove oito" → "6 9 8"
 *   "71 nove oito oito zero sete" → "71 9 8 8 0 7"
 */

const WORD_TO_DIGIT: Record<string, string> = {
  zero: "0",
  um: "1",
  uma: "1",
  dois: "2",
  duas: "2",
  três: "3",
  tres: "3",
  quatro: "4",
  cinco: "5",
  quina: "5",
  seis: "6",
  meia: "6",
  sete: "7",
  oito: "8",
  nove: "9",
};

export function spokenToDigits(text: string): string {
  return text
    .toLowerCase()
    .split(/[\s,.-]+/)
    .map((token) => {
      if (/^\d+$/.test(token)) return token;
      return WORD_TO_DIGIT[token] ?? token;
    })
    .join(" ");
}

/**
 * Extracts only digit characters from text after converting spoken words.
 * Returns just the digits as a string.
 *
 * Examples:
 *   "um dois três quatro cinco seis sete oito nove zero zero" → "12345678900"
 *   "71 988073480" → "71988073480"
 *   "meu CPF é 123.456.789-00" → "12345678900"
 */
export function extractDigits(text: string): string {
  const converted = spokenToDigits(text);
  return converted.replace(/\D/g, "");
}

/**
 * Normalizes spoken email patterns from Whisper transcriptions.
 * Converts Portuguese speech patterns to email format.
 *
 * Examples:
 *   "contato arroba empresa ponto com" → "contato@empresa.com"
 *   "contato@danilo carneiro.com" → "contato@danilocarneiro.com"
 *   "nome at gmail ponto com ponto br" → "nome@gmail.com.br"
 */
export function normalizeSpokenEmail(text: string): string {
  let result = text.toLowerCase().trim();

  // "arroba" / "aroba" → @
  result = result.replace(/\s*(arroba|aroba|at)\s*/g, "@");

  // "ponto" → . (but not "ponto com" as a single phrase first)
  result = result.replace(/\s*ponto\s*/g, ".");

  // "dot" → .
  result = result.replace(/\s*dot\s*/g, ".");

  // Remove spaces around @ and .
  result = result.replace(/\s*@\s*/g, "@");
  result = result.replace(/\s*\.\s*/g, ".");

  // Remove remaining spaces (email addresses have no spaces)
  // Only if it looks like an email (contains @)
  if (result.includes("@")) {
    result = result.replace(/\s+/g, "");
  }

  return result;
}
