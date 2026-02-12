import type { ChatMessage } from "@/lib/db";

export function formatChatHistory(messages: ChatMessage[]): string {
  if (messages.length === 0) return "(sem histórico)";

  return messages
    .map((m) => {
      const role = m.direction === "in" ? "Usuário" : "Assistente";
      return `${role}: ${m.text ?? ""}`;
    })
    .join("\n");
}

export function globalRouterSystemPrompt(): string {
  return `Você é um classificador de intenções para um assistente de WhatsApp. Sua tarefa é determinar qual fluxo atender com base na mensagem do usuário.

Fluxos disponíveis:
- "digital_certificate": Certificado digital (e-CPF, e-CNPJ, A1, A3, compra, renovação, suporte técnico, instalação, status de pedido, requisitos)
- "billing": Faturamento (boleto, fatura, pagamento, cobrança, nota fiscal, segunda via, financeiro)
- "general_support": Suporte geral (falar com atendente, humano, suporte, ajuda genérica, reclamação)
- "unknown": Quando a intenção não se encaixa nos fluxos acima ou é uma saudação genérica

Regras:
1. Saudações genéricas como "Oi", "Olá", "Bom dia" sem contexto adicional devem ser classificadas como "unknown".
2. Se a mensagem claramente menciona certificado digital ou termos relacionados, use "digital_certificate".
3. Se a mensagem menciona pagamento, boleto, fatura ou termos financeiros, use "billing".
4. Se o usuário pede para falar com um humano ou atendente, use "general_support".
5. Em caso de dúvida, prefira "unknown" com confidence baixa.

Responda APENAS com JSON válido no formato:
{"flow": "...", "confidence": 0.00, "reason": "..."}

Exemplos:
Mensagem: "Preciso de um certificado digital"
{"flow": "digital_certificate", "confidence": 0.95, "reason": "Usuário mencionou certificado digital"}

Mensagem: "Quero a segunda via do boleto"
{"flow": "billing", "confidence": 0.92, "reason": "Usuário pediu segunda via de boleto"}

Mensagem: "Oi, bom dia"
{"flow": "unknown", "confidence": 0.90, "reason": "Saudação genérica sem indicação de fluxo"}

Mensagem: "Quero falar com alguém"
{"flow": "general_support", "confidence": 0.88, "reason": "Usuário quer falar com atendente"}`;
}

export function globalRouterUserPrompt(
  text: string,
  chatHistory: ChatMessage[],
): string {
  const history = formatChatHistory(chatHistory);
  return `Histórico recente:\n${history}\n\nMensagem atual: ${text}`;
}

export function topicShiftSystemPrompt(): string {
  return `Você é um classificador de intenções para um assistente de WhatsApp. O usuário já está em um fluxo de atendimento e você precisa determinar se ele quer mudar de assunto.

Fluxos disponíveis:
- "digital_certificate": Certificado digital (e-CPF, e-CNPJ, A1, A3, compra, renovação, suporte técnico)
- "billing": Faturamento (boleto, fatura, pagamento, cobrança, nota fiscal)
- "general_support": Suporte geral (falar com atendente, humano, suporte)
- "unknown": Quando a intenção não é clara

Regras:
1. FAVOREÇA A CONTINUIDADE: se a mensagem pode ser interpretada dentro do fluxo atual, mantenha o fluxo atual.
2. Só mude de fluxo se a intenção do usuário for CLARAMENTE diferente do fluxo atual.
3. Respostas curtas como "sim", "não", "ok", números ou dados pessoais são continuação do fluxo atual.
4. Em caso de dúvida, mantenha o fluxo atual.

Responda APENAS com JSON válido no formato:
{"flow": "...", "confidence": 0.00, "reason": "..."}`;
}

export function topicShiftUserPrompt(
  text: string,
  currentFlow: string,
  chatHistory: ChatMessage[],
): string {
  const history = formatChatHistory(chatHistory);
  return `Fluxo atual: ${currentFlow}\nHistórico recente:\n${history}\n\nMensagem atual: ${text}`;
}
