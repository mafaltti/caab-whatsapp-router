import type { StepHandler } from "../../../types";
import { CONFIDENCE_ACCEPT } from "@/lib/llm/schemas";
import {
  extractPersonType,
  extractCpfCnpj,
  extractEmail,
  extractPhone,
} from "@/lib/llm/extractors";
import { isValidCpfCnpj, isValidEmail, isValidPhone } from "../validation";
import {
  incrementRetry,
  isMaxRetriesReached,
  HUMAN_HANDOFF_REPLY,
  detectConfirmation,
  detectFieldToCorrect,
  FIELD_TO_STEP,
  formatPurchaseSummary,
  generateProtocolId,
} from "../helpers";

// --- ask_person_type ---

export const handleAskPersonType: StepHandler = async (ctx) => {
  const { state, message, correlationId } = ctx;

  // First call: ask the question
  if (!state.data._asked_person_type) {
    return {
      reply: "Você é pessoa física (PF) ou pessoa jurídica (PJ)?",
      nextStep: "ask_person_type",
      data: { _asked_person_type: true },
    };
  }

  // Retry guard
  if (isMaxRetriesReached(state.data, "person_type")) {
    return { reply: HUMAN_HANDOFF_REPLY, nextStep: "ask_person_type", done: true };
  }

  // Extract
  const result = await extractPersonType({
    text: message.text,
    correlationId,
  });

  if (
    !result.ok ||
    !result.data.person_type ||
    result.data.confidence < CONFIDENCE_ACCEPT
  ) {
    return {
      reply: "Não consegui identificar. Você é *pessoa física (PF)* ou *pessoa jurídica (PJ)*?",
      nextStep: "ask_person_type",
      data: incrementRetry(state.data, "person_type"),
    };
  }

  const nextStep = state.data._correcting ? "confirm" : "ask_cpf_cnpj";

  return {
    reply:
      nextStep === "confirm"
        ? formatPurchaseSummary({
            ...state.data,
            person_type: result.data.person_type,
          })
        : `Certo, ${result.data.person_type === "PF" ? "pessoa física" : "pessoa jurídica"}! Agora preciso do seu ${result.data.person_type === "PF" ? "CPF" : "CNPJ"}.`,
    nextStep,
    data: {
      person_type: result.data.person_type,
      _asked_person_type: false,
      _correcting: nextStep === "confirm" ? false : state.data._correcting,
      person_type_retry_count: 0,
    },
  };
};

// --- ask_cpf_cnpj ---

export const handleAskCpfCnpj: StepHandler = async (ctx) => {
  const { state, message, correlationId } = ctx;
  const personType = (state.data.person_type as "PF" | "PJ") ?? "PF";
  const label = personType === "PJ" ? "CNPJ" : "CPF";

  // First call
  if (!state.data._asked_cpf_cnpj) {
    return {
      reply: `Por favor, envie seu ${label} (somente números).`,
      nextStep: "ask_cpf_cnpj",
      data: { _asked_cpf_cnpj: true },
    };
  }

  if (isMaxRetriesReached(state.data, "cpf_cnpj")) {
    return { reply: HUMAN_HANDOFF_REPLY, nextStep: "ask_cpf_cnpj", done: true };
  }

  const result = await extractCpfCnpj({
    text: message.text,
    expectedType: personType,
    correlationId,
  });

  if (
    !result.ok ||
    !result.data.cpf_cnpj ||
    result.data.confidence < CONFIDENCE_ACCEPT
  ) {
    return {
      reply: `Não consegui identificar um ${label} válido. Por favor, envie somente os números do seu ${label}.`,
      nextStep: "ask_cpf_cnpj",
      data: incrementRetry(state.data, "cpf_cnpj"),
    };
  }

  if (!isValidCpfCnpj(result.data.cpf_cnpj, personType)) {
    return {
      reply: `O ${label} informado parece inválido. Verifique e envie novamente (somente números).`,
      nextStep: "ask_cpf_cnpj",
      data: incrementRetry(state.data, "cpf_cnpj"),
    };
  }

  const nextStep = state.data._correcting ? "confirm" : "ask_email";

  return {
    reply:
      nextStep === "confirm"
        ? formatPurchaseSummary({
            ...state.data,
            cpf_cnpj: result.data.cpf_cnpj,
          })
        : `${label} registrado! Qual seu melhor email para contato?`,
    nextStep,
    data: {
      cpf_cnpj: result.data.cpf_cnpj,
      _asked_cpf_cnpj: false,
      _correcting: nextStep === "confirm" ? false : state.data._correcting,
      cpf_cnpj_retry_count: 0,
    },
  };
};

// --- ask_email ---

export const handleAskEmail: StepHandler = async (ctx) => {
  const { state, message, correlationId } = ctx;

  if (!state.data._asked_email) {
    return {
      reply: "Qual seu melhor email para contato?",
      nextStep: "ask_email",
      data: { _asked_email: true },
    };
  }

  if (isMaxRetriesReached(state.data, "email")) {
    return { reply: HUMAN_HANDOFF_REPLY, nextStep: "ask_email", done: true };
  }

  const result = await extractEmail({ text: message.text, correlationId });

  if (
    !result.ok ||
    !result.data.email ||
    result.data.confidence < CONFIDENCE_ACCEPT
  ) {
    return {
      reply: "Não consegui identificar um email válido. Por favor, envie seu email (ex: nome@empresa.com).",
      nextStep: "ask_email",
      data: incrementRetry(state.data, "email"),
    };
  }

  if (!isValidEmail(result.data.email)) {
    return {
      reply: "O email informado parece inválido. Por favor, envie um email válido (ex: nome@empresa.com).",
      nextStep: "ask_email",
      data: incrementRetry(state.data, "email"),
    };
  }

  const nextStep = state.data._correcting ? "confirm" : "ask_phone";

  return {
    reply:
      nextStep === "confirm"
        ? formatPurchaseSummary({ ...state.data, email: result.data.email })
        : "Email registrado! Agora, qual seu telefone com DDD? (ex: 11999998888)",
    nextStep,
    data: {
      email: result.data.email,
      _asked_email: false,
      _correcting: nextStep === "confirm" ? false : state.data._correcting,
      email_retry_count: 0,
    },
  };
};

// --- ask_phone ---

export const handleAskPhone: StepHandler = async (ctx) => {
  const { state, message, correlationId } = ctx;

  if (!state.data._asked_phone) {
    return {
      reply: "Qual seu telefone com DDD? (ex: 11999998888)",
      nextStep: "ask_phone",
      data: { _asked_phone: true },
    };
  }

  if (isMaxRetriesReached(state.data, "phone")) {
    return { reply: HUMAN_HANDOFF_REPLY, nextStep: "ask_phone", done: true };
  }

  const result = await extractPhone({ text: message.text, correlationId });

  if (
    !result.ok ||
    !result.data.phone ||
    result.data.confidence < CONFIDENCE_ACCEPT
  ) {
    return {
      reply: "Não consegui identificar o telefone. Envie somente números com DDD (ex: 11999998888).",
      nextStep: "ask_phone",
      data: incrementRetry(state.data, "phone"),
    };
  }

  if (!isValidPhone(result.data.phone)) {
    return {
      reply: "O telefone informado parece inválido. Envie com DDD, somente números (10 ou 11 dígitos).",
      nextStep: "ask_phone",
      data: incrementRetry(state.data, "phone"),
    };
  }

  return {
    reply: formatPurchaseSummary({ ...state.data, phone: result.data.phone }),
    nextStep: "confirm",
    data: {
      phone: result.data.phone,
      _asked_phone: false,
      phone_retry_count: 0,
    },
  };
};

// --- confirm ---

export const handleConfirm: StepHandler = async (ctx) => {
  const { message } = ctx;
  const answer = await detectConfirmation(message.text, ctx.correlationId);

  if (answer === "yes") {
    const protocol = generateProtocolId();
    return {
      reply:
        `Perfeito! Seu pedido de certificado digital foi registrado com sucesso.\n\n` +
        `Protocolo: *${protocol}*\n\n` +
        `Em breve nossa equipe entrará em contato pelo email e telefone informados. Obrigado!`,
      nextStep: "confirm",
      data: { protocol_id: protocol },
      done: true,
    };
  }

  if (answer === "no") {
    return {
      reply:
        "Sem problemas! Qual dado você gostaria de corrigir?\n\n" +
        "1. Tipo de pessoa (PF/PJ)\n" +
        "2. CPF/CNPJ\n" +
        "3. Email\n" +
        "4. Telefone\n\n" +
        "Envie o número ou o nome do campo.",
      nextStep: "ask_correction",
    };
  }

  // unclear
  return {
    reply: "Por favor, responda *sim* para confirmar ou *não* para corrigir algum dado.",
    nextStep: "confirm",
  };
};

// --- ask_correction ---

export const handleAskCorrection: StepHandler = async (ctx) => {
  const { message } = ctx;
  const field = detectFieldToCorrect(message.text);

  if (!field) {
    return {
      reply:
        "Não identifiquei o campo. Por favor, envie o número:\n\n" +
        "1. Tipo de pessoa\n2. CPF/CNPJ\n3. Email\n4. Telefone",
      nextStep: "ask_correction",
    };
  }

  const step = FIELD_TO_STEP[field];
  const askedKey = `_asked_${field}` as string;

  return {
    reply: getReaskMessage(field),
    nextStep: step,
    data: {
      [field]: null,
      [askedKey]: true,
      _correcting: true,
      [`${field}_retry_count`]: 0,
    },
  };
};

function getReaskMessage(field: string): string {
  switch (field) {
    case "person_type":
      return "Certo! Você é pessoa física (PF) ou pessoa jurídica (PJ)?";
    case "cpf_cnpj":
      return "Certo! Envie o CPF ou CNPJ correto (somente números).";
    case "email":
      return "Certo! Envie o email correto.";
    case "phone":
      return "Certo! Envie o telefone correto com DDD (somente números).";
    default:
      return "Por favor, envie o dado correto.";
  }
}
