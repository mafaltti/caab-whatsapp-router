import { logger } from "@/lib/shared";
import type { NormalizedMessage } from "@/lib/shared";
import {
  upsertSession,
  clearSession,
  insertOutbound,
  loadRecentMessages,
  type SessionState,
} from "@/lib/db";
import { sendText } from "@/lib/evolution";
import {
  classifyFlow,
  detectTopicShift,
  CONFIDENCE_ACCEPT,
  CONFIDENCE_CLARIFY,
  type FlowType,
} from "@/lib/llm";
import { executeFlow, type FlowExecutionResult } from "@/lib/flows";

const ERROR_REPLY =
  "Desculpe, estou com dificuldades técnicas no momento. Por favor, tente novamente em alguns minutos.";

const JSON_FALLBACK_REPLY =
  "Desculpe, não entendi. Pode reformular sua mensagem?";

interface RouteMessageOptions {
  message: NormalizedMessage;
  session: SessionState | null;
  correlationId: string;
}

export async function routeMessage(options: RouteMessageOptions): Promise<void> {
  const { message, session, correlationId } = options;

  try {
    const chatHistory = await loadRecentMessages(message.userId, 5);

    let flow: FlowType;
    let reply: string;
    let nextState: FlowExecutionResult["nextState"];
    let done = false;

    if (session?.activeFlow) {
      // Skip topic shift for unknown flow — it handles its own classification
      const shift =
        session.activeFlow === "unknown"
          ? null
          : await detectTopicShift({
              text: message.text,
              currentFlow: session.activeFlow,
              chatHistory,
              correlationId,
            });

      if (shift) {
        flow = shift.flow;

        logger.info({
          correlation_id: correlationId,
          event: "flow_transition",
          user_id: message.userId,
          instance: message.instanceName,
          from_flow: session.activeFlow,
          flow,
          confidence: shift.confidence,
        });

        const flowResult = await executeFlow({
          state: {
            ...session,
            activeFlow: flow,
            activeSubroute: null,
            step: "start",
            data: {},
          },
          message,
          chatHistory,
          correlationId,
        });

        reply = "Entendi, vamos mudar de assunto. " + flowResult.reply;
        nextState = flowResult.nextState;
        done = flowResult.done;
      } else {
        // No topic shift — continue current flow
        flow = session.activeFlow as FlowType;

        logger.info({
          correlation_id: correlationId,
          event: "flow_continued",
          user_id: message.userId,
          instance: message.instanceName,
          flow,
        });

        const flowResult = await executeFlow({
          state: session,
          message,
          chatHistory,
          correlationId,
        });

        reply = flowResult.reply;
        nextState = flowResult.nextState;
        done = flowResult.done;
      }
    } else {
      // New or expired session — classify from scratch
      const result = await classifyFlow({
        text: message.text,
        chatHistory,
        correlationId,
      });

      if (!result.ok) {
        const replyText =
          result.errorType === "llm_error" ? ERROR_REPLY : JSON_FALLBACK_REPLY;

        logger.warn({
          correlation_id: correlationId,
          event: "classify_flow_failed",
          user_id: message.userId,
          instance: message.instanceName,
          error_type: result.errorType,
        });

        await sendText(
          message.instanceName,
          message.remoteJid,
          replyText,
          correlationId,
        );

        insertOutbound(message.userId, message.instanceName, replyText).catch(
          (err) => {
            logger.error({
              correlation_id: correlationId,
              event: "outbound_persist_error",
              user_id: message.userId,
              instance: message.instanceName,
              error: err instanceof Error ? err.message : String(err),
            });
          },
        );

        return;
      }

      const classification = result.data;

      if (classification.confidence >= CONFIDENCE_ACCEPT) {
        flow = classification.flow;
      } else if (classification.confidence >= CONFIDENCE_CLARIFY) {
        flow = "unknown";
      } else {
        flow = "unknown";
      }

      logger.info({
        correlation_id: correlationId,
        event: "flow_transition",
        user_id: message.userId,
        instance: message.instanceName,
        flow,
        confidence: classification.confidence,
      });

      const flowResult = await executeFlow({
        state: {
          userId: message.userId,
          instance: message.instanceName,
          activeFlow: flow,
          activeSubroute: null,
          step: "start",
          data: {},
          updatedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        },
        message,
        chatHistory,
        correlationId,
      });

      reply = flowResult.reply;
      nextState = flowResult.nextState;
      done = flowResult.done;
    }

    // Handle _handoff_flow from unknown conversational flow
    if (nextState.data._handoff_flow) {
      const handoffFlow = nextState.data._handoff_flow as string;

      logger.info({
        correlation_id: correlationId,
        event: "flow_transition",
        user_id: message.userId,
        instance: message.instanceName,
        from_flow: "unknown",
        flow: handoffFlow,
        reason: "handoff_from_unknown",
      });

      const handoffResult = await executeFlow({
        state: {
          userId: message.userId,
          instance: message.instanceName,
          activeFlow: handoffFlow,
          activeSubroute: null,
          step: "start",
          data: {},
          updatedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        },
        message,
        chatHistory,
        correlationId,
      });

      reply = handoffResult.reply;
      nextState = handoffResult.nextState;
      done = handoffResult.done;
    }

    // Persist session state
    if (done) {
      await clearSession(message.userId);
    } else {
      await upsertSession({
        userId: message.userId,
        instance: message.instanceName,
        activeFlow: nextState.activeFlow,
        activeSubroute: nextState.activeSubroute,
        step: nextState.step,
        data: nextState.data,
      });
    }

    // Send reply
    await sendText(
      message.instanceName,
      message.remoteJid,
      reply,
      correlationId,
    );

    // Persist outbound
    insertOutbound(message.userId, message.instanceName, reply).catch((err) => {
      logger.error({
        correlation_id: correlationId,
        event: "outbound_persist_error",
        user_id: message.userId,
        instance: message.instanceName,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  } catch (err) {
    logger.error({
      correlation_id: correlationId,
      event: "route_message_error",
      user_id: message.userId,
      instance: message.instanceName,
      error: err instanceof Error ? err.message : String(err),
    });

    // Best-effort error reply
    sendText(
      message.instanceName,
      message.remoteJid,
      ERROR_REPLY,
      correlationId,
    ).catch(() => {});
  }
}
