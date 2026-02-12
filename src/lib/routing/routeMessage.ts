import { logger } from "@/lib/shared";
import type { NormalizedMessage } from "@/lib/shared";
import {
  upsertSession,
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

const FLOW_REPLIES: Record<FlowType, string> = {
  digital_certificate:
    "Entendi que você precisa de ajuda com certificado digital! Em breve vou te guiar pelo processo. Por enquanto, aguarde que estamos implementando o fluxo completo.",
  billing:
    "Entendi que você precisa de ajuda com faturamento! Em breve vou te guiar pelo processo. Por enquanto, aguarde que estamos implementando o fluxo completo.",
  general_support:
    "Entendi que você precisa de suporte! Em breve vou te conectar com alguém que possa ajudar. Por enquanto, aguarde que estamos implementando o fluxo completo.",
  unknown:
    "Olá! Como posso te ajudar? Trabalho com certificado digital, faturamento e suporte geral.",
};

const CLARIFY_REPLY =
  "Desculpe, não tenho certeza do que você precisa. Pode me dizer com mais detalhes?";

const TOPIC_SWITCH_PREFIX = "Entendi, vamos mudar de assunto. ";

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

    if (session?.activeFlow) {
      // Existing session — check for topic shift
      const shift = await detectTopicShift({
        text: message.text,
        currentFlow: session.activeFlow,
        chatHistory,
        correlationId,
      });

      if (shift) {
        flow = shift.flow;
        reply = TOPIC_SWITCH_PREFIX + FLOW_REPLIES[flow];

        logger.info({
          correlation_id: correlationId,
          event: "flow_transition",
          user_id: message.userId,
          instance: message.instanceName,
          from_flow: session.activeFlow,
          flow,
          confidence: shift.confidence,
        });
      } else {
        // No topic shift — continue current flow
        flow = session.activeFlow as FlowType;
        // Phase 5 will replace this with step execution
        reply = FLOW_REPLIES[flow] ?? FLOW_REPLIES.unknown;

        logger.info({
          correlation_id: correlationId,
          event: "flow_continued",
          user_id: message.userId,
          instance: message.instanceName,
          flow,
        });
      }
    } else {
      // New or expired session — classify from scratch
      const result = await classifyFlow({
        text: message.text,
        chatHistory,
        correlationId,
      });

      if (!result.ok) {
        // LLM service error → technical difficulties message
        // Invalid JSON / schema validation → ask user to reformulate
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
        reply = FLOW_REPLIES[flow];
      } else if (classification.confidence >= CONFIDENCE_CLARIFY) {
        flow = "unknown";
        reply = CLARIFY_REPLY;
      } else {
        flow = "unknown";
        reply = FLOW_REPLIES.unknown;
      }

      logger.info({
        correlation_id: correlationId,
        event: "flow_transition",
        user_id: message.userId,
        instance: message.instanceName,
        flow,
        confidence: classification.confidence,
      });
    }

    // Upsert session
    await upsertSession({
      userId: message.userId,
      instance: message.instanceName,
      activeFlow: flow,
      activeSubroute: flow === session?.activeFlow ? (session.activeSubroute ?? null) : null,
      step: flow === session?.activeFlow ? (session.step ?? "start") : "start",
      data: flow === session?.activeFlow ? (session.data ?? {}) : {},
    });

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
