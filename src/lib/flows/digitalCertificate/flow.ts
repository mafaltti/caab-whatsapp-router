import type { FlowDefinition } from "../types";
import { handleStart } from "./steps";
import {
  handleAskPersonType,
  handleAskCpfCnpj,
  handleAskEmail as handlePurchaseAskEmail,
  handleAskPhone,
  handleConfirm as handlePurchaseConfirm,
  handleAskCorrection,
} from "./subroutes/purchase";
import {
  handleAskOrderId as handleRenewalAskOrderId,
  handleAskEmail as handleRenewalAskEmail,
  handleConfirm as handleRenewalConfirm,
} from "./subroutes/renewal";
import {
  handleAskProblem,
  handleAskOrderId as handleSupportAskOrderId,
  handleConfirm as handleSupportConfirm,
} from "./subroutes/support";
import {
  handleShowInfo,
  handleOfferPurchase,
} from "./subroutes/requirements";
import { handleAskOrderId as handleStatusAskOrderId } from "./subroutes/status";

export const digitalCertificateFlow: FlowDefinition = {
  id: "digital_certificate",
  steps: { start: handleStart },
  subroutes: {
    purchase: {
      entryStep: "ask_person_type",
      steps: {
        ask_person_type: handleAskPersonType,
        ask_cpf_cnpj: handleAskCpfCnpj,
        ask_email: handlePurchaseAskEmail,
        ask_phone: handleAskPhone,
        confirm: handlePurchaseConfirm,
        ask_correction: handleAskCorrection,
      },
    },
    renewal: {
      entryStep: "ask_order_id",
      steps: {
        ask_order_id: handleRenewalAskOrderId,
        ask_email: handleRenewalAskEmail,
        confirm: handleRenewalConfirm,
      },
    },
    support: {
      entryStep: "ask_problem",
      steps: {
        ask_problem: handleAskProblem,
        ask_order_id: handleSupportAskOrderId,
        confirm: handleSupportConfirm,
      },
    },
    requirements: {
      entryStep: "show_info",
      steps: {
        show_info: handleShowInfo,
        offer_purchase: handleOfferPurchase,
      },
    },
    status: {
      entryStep: "ask_order_id",
      steps: {
        ask_order_id: handleStatusAskOrderId,
      },
    },
  },
};
