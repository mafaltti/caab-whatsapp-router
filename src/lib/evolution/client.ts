import { logger } from "@/lib/shared/logger";

function getConfig() {
  const baseUrl = process.env.EVOLUTION_BASE_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;

  if (!baseUrl) throw new Error("Missing env var EVOLUTION_BASE_URL");
  if (!apiKey) throw new Error("Missing env var EVOLUTION_API_KEY");

  return { baseUrl, apiKey };
}

export async function sendText(
  instance: string,
  remoteJid: string,
  text: string,
  correlationId?: string,
): Promise<boolean> {
  const { baseUrl, apiKey } = getConfig();
  const url = `${baseUrl}/message/sendText/${instance}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify({ number: remoteJid, text }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      logger.error({
        correlation_id: correlationId,
        event: "send_text_failed",
        instance,
        error: `HTTP ${response.status}: ${response.statusText}`,
      });
      return false;
    }

    logger.info({
      correlation_id: correlationId,
      event: "message_sent",
      instance,
    });

    return true;
  } catch (err) {
    logger.error({
      correlation_id: correlationId,
      event: "send_text_error",
      instance,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
