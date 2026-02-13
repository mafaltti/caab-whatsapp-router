/**
 * Pure validation functions for digital certificate flow fields.
 * MVP: length + not-all-same-digit checks (no mathematical check-digit).
 */

export function isValidCpf(digits: string): boolean {
  if (!/^\d{11}$/.test(digits)) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;
  return true;
}

export function isValidCnpj(digits: string): boolean {
  if (!/^\d{14}$/.test(digits)) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;
  return true;
}

export function isValidCpfCnpj(
  digits: string,
  personType: "PF" | "PJ",
): boolean {
  return personType === "PF" ? isValidCpf(digits) : isValidCnpj(digits);
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidPhone(digits: string): boolean {
  if (!/^\d{10,11}$/.test(digits)) return false;
  if (/^(\d)\1{9,10}$/.test(digits)) return false;
  return true;
}
