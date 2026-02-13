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
