import { NextResponse, after } from "next/server";
import { logger, generateCorrelationId } from "@/lib/shared";
import { normalizeMessage, applyGuards } from "@/lib/webhook";
import { sendText } from "@/lib/evolution";
import { insertInboundIfNew, getSession, type SessionState } from "@/lib/db";
import { routeMessage } from "@/lib/routing";

export async function POST(request: Request) {
  const correlationId = generateCorrelationId();

  try {
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      logger.warn({
        correlation_id: correlationId,
        event: "invalid_json",
      });
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    logger.info({
      correlation_id: correlationId,
      event: "webhook_received",
    });

    const message = normalizeMessage(payload);

    if (!message) {
      logger.warn({
        correlation_id: correlationId,
        event: "normalization_failed",
      });
      return NextResponse.json({ ok: true });
    }

    const guardResult = applyGuards(
      message,
      payload as import("@/lib/webhook").EvolutionWebhookPayload,
    );

    if (!guardResult.shouldProcess) {
      logger.info({
        correlation_id: correlationId,
        event: "guard_applied",
        user_id: message.userId,
        instance: message.instanceName,
        reason: guardResult.reason,
      });

      if (guardResult.requiresAutoReply && guardResult.autoReplyText) {
        const autoReplyText = guardResult.autoReplyText;
        after(async () => {
          sendText(
            message.instanceName,
            message.remoteJid,
            autoReplyText,
            correlationId,
          ).catch(() => {});
        });
      }

      return NextResponse.json({ ok: true });
    }

    logger.info({
      correlation_id: correlationId,
      event: "guard_passed",
      user_id: message.userId,
      instance: message.instanceName,
      message_id: message.messageId,
      text_length: message.text.length,
    });

    // Defer heavy processing (DB + LLM + API calls) to after response
    after(async () => {
      try {
        // --- Deduplication ---
        const dedupeStart = performance.now();
        let isNewMessage: boolean;

        try {
          isNewMessage = await insertInboundIfNew(
            message.messageId,
            message.userId,
            message.instanceName,
            message.text,
          );
        } catch (err) {
          logger.error({
            correlation_id: correlationId,
            event: "dedupe_error",
            user_id: message.userId,
            instance: message.instanceName,
            error: err instanceof Error ? err.message : String(err),
          });
          return;
        }

        const dedupeDuration = Math.round(performance.now() - dedupeStart);

        if (!isNewMessage) {
          logger.info({
            correlation_id: correlationId,
            event: "message_duplicate",
            user_id: message.userId,
            instance: message.instanceName,
            message_id: message.messageId,
            duration_ms: dedupeDuration,
          });
          return;
        }

        logger.info({
          correlation_id: correlationId,
          event: "new_message_stored",
          user_id: message.userId,
          instance: message.instanceName,
          message_id: message.messageId,
          duration_ms: dedupeDuration,
        });

        // --- Session loading ---
        const sessionStart = performance.now();
        let session: SessionState | null;

        try {
          session = await getSession(message.userId);
        } catch (err) {
          logger.error({
            correlation_id: correlationId,
            event: "session_load_error",
            user_id: message.userId,
            instance: message.instanceName,
            error: err instanceof Error ? err.message : String(err),
          });
          return;
        }

        const sessionDuration = Math.round(performance.now() - sessionStart);

        logger.info({
          correlation_id: correlationId,
          event: session ? "session_loaded" : "session_new_user",
          user_id: message.userId,
          instance: message.instanceName,
          ...(session && {
            flow: session.activeFlow,
            step: session.step,
          }),
          duration_ms: sessionDuration,
        });

        // --- Route message ---
        await routeMessage({ message, session, correlationId });
      } catch (err) {
        logger.error({
          correlation_id: correlationId,
          event: "after_processing_error",
          user_id: message.userId,
          instance: message.instanceName,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error({
      correlation_id: correlationId,
      event: "webhook_unhandled_error",
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ ok: true });
  }
}
