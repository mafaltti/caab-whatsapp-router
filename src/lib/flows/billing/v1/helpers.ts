/**
 * Shared utilities for billing flow subroutes.
 */

const MAX_RETRIES = 3;

// --- Invoice mock data ---

interface InvoiceStatus {
  status: string;
  value: string;
  detail: string;
}

export function getMockInvoiceStatus(invoiceId: string): InvoiceStatus {
  const lastChar = invoiceId.charAt(invoiceId.length - 1);
  const digit = parseInt(lastChar, 10);

  if (!isNaN(digit) && digit <= 3) {
    return {
      status: "Pago",
      value: "R$ 350,00",
      detail: "💳 Pagamento confirmado em 05/02/2026",
    };
  }
  if (!isNaN(digit) && digit <= 6) {
    return {
      status: "Pendente",
      value: "R$ 450,00",
      detail:
        "📅 Vencimento: 20/02/2026\n\n" +
        "Para efetuar o pagamento, utilize o boleto enviado por email ou entre em contato com nosso financeiro.",
    };
  }
  return {
    status: "Vencido",
    value: "R$ 280,00",
    detail:
      "⚠️ Esta fatura está vencida. Entre em contato com nosso financeiro para negociar o pagamento.",
  };
}

export function formatInvoiceResponse(
  invoiceId: string,
  invoice: InvoiceStatus,
): string {
  return (
    `Fatura *#${invoiceId}*:\n\n` +
    `📊 *Status:* ${invoice.status}\n` +
    `💰 *Valor:* ${invoice.value}\n` +
    `${invoice.detail}`
  );
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
