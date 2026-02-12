import type { ChatMessage } from "@/lib/db";
import type { SubrouteDefinition } from "./schemas";

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

// --- Subroute Router Prompts ---

function buildSubrouteExamples(flow: string): string {
  if (flow === "digital_certificate") {
    return `
Exemplos:
Mensagem: "Quero comprar um certificado"
{"subroute": "purchase", "confidence": 0.93, "reason": "Usuario quer comprar certificado novo"}

Mensagem: "Preciso renovar meu e-CPF"
{"subroute": "renewal", "confidence": 0.95, "reason": "Usuario quer renovar certificado existente"}

Mensagem: "Meu certificado não está funcionando"
{"subroute": "support", "confidence": 0.90, "reason": "Usuario tem problema tecnico com certificado"}

Mensagem: "Quais documentos preciso?"
{"subroute": "requirements", "confidence": 0.88, "reason": "Usuario quer saber requisitos necessarios"}

Mensagem: "Qual o status do meu pedido?"
{"subroute": "status", "confidence": 0.92, "reason": "Usuario quer verificar status de pedido"}`;
  }

  if (flow === "billing") {
    return `
Exemplos:
Mensagem: "Quero ver minha fatura"
{"subroute": "status", "confidence": 0.91, "reason": "Usuario quer consultar fatura"}`;
  }

  return "";
}

export function subrouteRouterSystemPrompt(
  flow: string,
  subroutes: SubrouteDefinition[],
): string {
  const subrouteList = subroutes
    .map((s) => `- "${s.id}": ${s.description}`)
    .join("\n");

  const examples = buildSubrouteExamples(flow);

  return `Você é um classificador de sub-rotas para um assistente de WhatsApp. O usuário já está no fluxo "${flow}". Sua tarefa é determinar qual sub-rota atender.

Sub-rotas disponíveis para "${flow}":
${subrouteList}

Regras:
1. Classifique a mensagem do usuário na sub-rota mais adequada.
2. Se a mensagem não se encaixa claramente em nenhuma sub-rota, retorne "subroute": null com confidence baixa.
3. Use o histórico recente para contexto, mas priorize a mensagem atual.
4. Respostas curtas como "sim", "não", "ok" devem ser classificadas com base no contexto do histórico.

Responda APENAS com JSON válido no formato:
{"subroute": "..." | null, "confidence": 0.00, "reason": "..."}
${examples}`;
}

export function subrouteRouterUserPrompt(
  text: string,
  chatHistory: ChatMessage[],
): string {
  const history = formatChatHistory(chatHistory);
  return `Histórico recente:\n${history}\n\nMensagem atual: ${text}`;
}

// --- Combined Data Extraction Prompts ---

export function dataExtractionSystemPrompt(): string {
  return `Você é um extrator de dados para um assistente de WhatsApp. Extraia as seguintes informações da mensagem do usuário:

Campos:
- "person_type": "PF" (pessoa física) ou "PJ" (pessoa jurídica) ou null se não mencionado
- "cpf_cnpj": Apenas dígitos do CPF (11 dígitos) ou CNPJ (14 dígitos), ou null. Remova pontos, traços e barras.
- "email": Endereço de email válido, ou null
- "phone": Apenas dígitos do telefone (DDD + número), ou null. Remova parênteses, traços e espaços.
- "confidence": Sua confiança geral na extração (0 a 1)
- "missing_fields": Lista de campos que não foram encontrados na mensagem

Regras:
1. CPF tem 11 dígitos, CNPJ tem 14 dígitos. Retorne APENAS dígitos, sem formatação.
2. Se o usuário informar CPF, person_type é "PF". Se informar CNPJ, person_type é "PJ".
3. Telefone deve conter DDD + número, apenas dígitos.
4. Se um campo não está presente na mensagem, retorne null para o campo e inclua-o em missing_fields.

Responda APENAS com JSON válido no formato:
{"person_type": "PF"|"PJ"|null, "cpf_cnpj": "digits"|null, "email": "email"|null, "phone": "digits"|null, "confidence": 0.00, "missing_fields": ["field1"]}

Exemplos:
Mensagem: "Meu CPF é 123.456.789-00 e meu email é joao@email.com"
{"person_type": "PF", "cpf_cnpj": "12345678900", "email": "joao@email.com", "phone": null, "confidence": 0.95, "missing_fields": ["phone"]}

Mensagem: "CNPJ 12.345.678/0001-90, telefone (11) 99999-8888"
{"person_type": "PJ", "cpf_cnpj": "12345678000190", "email": null, "phone": "11999998888", "confidence": 0.93, "missing_fields": ["email"]}`;
}

export function dataExtractionUserPrompt(text: string): string {
  return `Mensagem do usuario: ${text}`;
}

// --- Individual Extraction Prompts ---

export function personTypeExtractionSystemPrompt(): string {
  return `Você é um extrator de dados para um assistente de WhatsApp. Determine se o usuário é pessoa física (PF) ou pessoa jurídica (PJ).

Regras:
1. Se o usuário mencionar CPF, é "PF".
2. Se o usuário mencionar CNPJ, empresa, firma, ou razão social, é "PJ".
3. Se não for possível determinar, retorne null.

Responda APENAS com JSON válido no formato:
{"person_type": "PF"|"PJ"|null, "confidence": 0.00}

Exemplos:
Mensagem: "Sou pessoa física"
{"person_type": "PF", "confidence": 0.95}

Mensagem: "É para minha empresa"
{"person_type": "PJ", "confidence": 0.90}

Mensagem: "Quero comprar"
{"person_type": null, "confidence": 0.30}`;
}

export function personTypeExtractionUserPrompt(text: string): string {
  return `Mensagem do usuario: ${text}`;
}

export function cpfCnpjExtractionSystemPrompt(
  expectedType: "PF" | "PJ" | null,
): string {
  let digitHint: string;
  if (expectedType === "PF") {
    digitHint =
      "O usuário é pessoa física. Procure um CPF (11 dígitos numéricos).";
  } else if (expectedType === "PJ") {
    digitHint =
      "O usuário é pessoa jurídica. Procure um CNPJ (14 dígitos numéricos).";
  } else {
    digitHint =
      "Procure um CPF (11 dígitos) ou CNPJ (14 dígitos) na mensagem.";
  }

  return `Você é um extrator de dados para um assistente de WhatsApp. Extraia o CPF ou CNPJ da mensagem do usuário.

${digitHint}

Regras:
1. Retorne APENAS os dígitos, sem pontos, traços ou barras.
2. Se não encontrar um número válido, retorne null.
3. CPF tem exatamente 11 dígitos. CNPJ tem exatamente 14 dígitos.

Responda APENAS com JSON válido no formato:
{"cpf_cnpj": "digits"|null, "confidence": 0.00}

Exemplos:
Mensagem: "123.456.789-00"
{"cpf_cnpj": "12345678900", "confidence": 0.98}

Mensagem: "12.345.678/0001-90"
{"cpf_cnpj": "12345678000190", "confidence": 0.98}

Mensagem: "Não tenho agora"
{"cpf_cnpj": null, "confidence": 0.85}`;
}

export function cpfCnpjExtractionUserPrompt(text: string): string {
  return `Mensagem do usuario: ${text}`;
}

export function emailExtractionSystemPrompt(): string {
  return `Você é um extrator de dados para um assistente de WhatsApp. Extraia o endereço de email da mensagem do usuário.

Regras:
1. Retorne o email exatamente como escrito pelo usuário.
2. Se não encontrar um email válido, retorne null.

Responda APENAS com JSON válido no formato:
{"email": "email"|null, "confidence": 0.00}

Exemplos:
Mensagem: "Meu email é joao@empresa.com.br"
{"email": "joao@empresa.com.br", "confidence": 0.98}

Mensagem: "joao arroba empresa ponto com"
{"email": "joao@empresa.com", "confidence": 0.75}

Mensagem: "Não tenho email"
{"email": null, "confidence": 0.90}`;
}

export function emailExtractionUserPrompt(text: string): string {
  return `Mensagem do usuario: ${text}`;
}

export function phoneExtractionSystemPrompt(): string {
  return `Você é um extrator de dados para um assistente de WhatsApp. Extraia o número de telefone da mensagem do usuário.

Regras:
1. Retorne APENAS os dígitos do telefone (DDD + número), sem parênteses, traços ou espaços.
2. Se não encontrar um telefone, retorne null.
3. Telefones brasileiros têm DDD (2 dígitos) + número (8 ou 9 dígitos).

Responda APENAS com JSON válido no formato:
{"phone": "digits"|null, "confidence": 0.00}

Exemplos:
Mensagem: "(11) 99999-8888"
{"phone": "11999998888", "confidence": 0.98}

Mensagem: "11 98765-4321"
{"phone": "11987654321", "confidence": 0.95}

Mensagem: "Não quero informar"
{"phone": null, "confidence": 0.85}`;
}

export function phoneExtractionUserPrompt(text: string): string {
  return `Mensagem do usuario: ${text}`;
}
