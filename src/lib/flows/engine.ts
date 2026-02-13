import { logger } from "@/lib/shared";
import { classifySubroute, CONFIDENCE_ACCEPT, SafetyOverrideError } from "@/lib/llm";
import { getFlowDefinition } from "./registry";
import type {
  FlowContext,
  FlowExecutionResult,
  StepHandler,
  FlowDefinition,
} from "./types";

const TECHNICAL_ERROR_REPLY =
  "Desculpe, estou com dificuldades técnicas no momento. Por favor, tente novamente em alguns minutos.";

const RESTART_REPLY =
  "Desculpe, algo deu errado. Vamos recomeçar — como posso te ajudar?";

const CLARIFY_SUBROUTE_REPLY =
  "Não tenho certeza do que você precisa nesse assunto. Pode me dizer com mais detalhes?";

function hasSubroutes(flow: FlowDefinition): boolean {
  return !!flow.subroutes && Object.keys(flow.subroutes).length > 0;
}

export async function executeFlow(
  ctx: FlowContext,
): Promise<FlowExecutionResult> {
  const { state, message, chatHistory, correlationId } = ctx;
  const flowId = state.activeFlow ?? "unknown";

  // 1. Look up flow definition
  const flow = getFlowDefinition(flowId);
  if (!flow) {
    logger.error({
      correlation_id: correlationId,
      event: "flow_not_found",
      user_id: message.userId,
      instance: message.instanceName,
      flow: flowId,
    });
    return {
      reply: TECHNICAL_ERROR_REPLY,
      nextState: {
        activeFlow: null,
        activeSubroute: null,
        step: "start",
        data: {},
      },
      done: true,
    };
  }

  // 2. Subroute classification (only if flow has subroutes AND no active subroute)
  let activeSubroute = state.activeSubroute;
  let currentStep = state.step;

  if (hasSubroutes(flow) && !activeSubroute) {
    const result = await classifySubroute({
      text: message.text,
      flow: flowId,
      chatHistory,
      correlationId,
    });

    if (result.ok && result.data.confidence >= CONFIDENCE_ACCEPT && result.data.subroute) {
      const subrouteDef = flow.subroutes![result.data.subroute];
      if (subrouteDef) {
        activeSubroute = result.data.subroute;
        currentStep = subrouteDef.entryStep;

        logger.info({
          correlation_id: correlationId,
          event: "subroute_selected",
          user_id: message.userId,
          instance: message.instanceName,
          flow: flowId,
          subroute: activeSubroute,
          confidence: result.data.confidence,
        });
      }
    } else {
      // Low confidence or error → ask for clarification, stay on start
      logger.info({
        correlation_id: correlationId,
        event: "subroute_unclear",
        user_id: message.userId,
        instance: message.instanceName,
        flow: flowId,
        error_type: result.ok ? "low_confidence" : result.errorType,
      });

      return {
        reply: CLARIFY_SUBROUTE_REPLY,
        nextState: {
          activeFlow: flowId,
          activeSubroute: null,
          step: "start",
          data: state.data,
        },
        done: false,
      };
    }
  }

  // 3. Resolve step handler
  let handler: StepHandler | undefined;

  if (activeSubroute && flow.subroutes?.[activeSubroute]) {
    handler = flow.subroutes[activeSubroute].steps[currentStep];
  } else {
    handler = flow.steps[currentStep];
  }

  if (!handler) {
    logger.error({
      correlation_id: correlationId,
      event: "step_not_found",
      user_id: message.userId,
      instance: message.instanceName,
      flow: flowId,
      subroute: activeSubroute,
      step: currentStep,
    });
    return {
      reply: RESTART_REPLY,
      nextState: {
        activeFlow: null,
        activeSubroute: null,
        step: "start",
        data: {},
      },
      done: true,
    };
  }

  // 4. Execute handler
  try {
    const stepResult = await handler(ctx);
    const done = stepResult.done ?? false;

    logger.info({
      correlation_id: correlationId,
      event: "step_executed",
      user_id: message.userId,
      instance: message.instanceName,
      flow: flowId,
      subroute: activeSubroute,
      from_step: currentStep,
      to_step: stepResult.nextStep,
      done,
    });

    return {
      reply: stepResult.reply,
      nextState: {
        activeFlow: done ? null : flowId,
        activeSubroute: done ? null : activeSubroute,
        step: stepResult.nextStep,
        data: { ...state.data, ...stepResult.data },
      },
      done,
    };
  } catch (err) {
    if (err instanceof SafetyOverrideError) throw err;
    logger.error({
      correlation_id: correlationId,
      event: "step_execution_error",
      user_id: message.userId,
      instance: message.instanceName,
      flow: flowId,
      subroute: activeSubroute,
      step: currentStep,
      error: err instanceof Error ? err.message : String(err),
    });

    return {
      reply: TECHNICAL_ERROR_REPLY,
      nextState: {
        activeFlow: state.activeFlow,
        activeSubroute: state.activeSubroute,
        step: state.step,
        data: state.data,
      },
      done: false,
    };
  }
}
