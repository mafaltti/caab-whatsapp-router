import { NextResponse } from "next/server";
import { logger, generateCorrelationId } from "@/lib/shared";
import { normalizeMessage, applyGuards } from "@/lib/webhook";
import { sendText } from "@/lib/evolution";

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
        sendText(
          message.instanceName,
          message.remoteJid,
          guardResult.autoReplyText,
          correlationId,
        ).catch(() => {
          // fire-and-forget: error already logged inside sendText
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

    // TODO Phase 3: Deduplicate by message_id (insertInboundIfNew)
    // TODO Phase 3: Load/create session (getSession / upsertSession)
    // TODO Phase 4: Global flow router (LLM Layer A)
    // TODO Phase 4: Topic shift detection
    // TODO Phase 5: In-flow subroute selection (LLM Layer B)
    // TODO Phase 5: Step machine execution
    // TODO Phase 5: Send reply and persist outbound message

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
