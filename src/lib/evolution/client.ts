import { logger } from "@/lib/shared/logger";

function getConfig() {
  const baseUrl = process.env.EVOLUTION_BASE_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;

  if (!baseUrl) throw new Error("Missing env var EVOLUTION_BASE_URL");
  if (!apiKey) throw new Error("Missing env var EVOLUTION_API_KEY");

  return { baseUrl, apiKey };
}

export interface MediaBase64Result {
  base64: string;
  mimetype: string;
  fileName: string;
}

export async function getMediaBase64(
  instance: string,
  messageId: string,
  correlationId?: string,
): Promise<MediaBase64Result> {
  const { baseUrl, apiKey } = getConfig();
  const url = `${baseUrl}/chat/getBase64FromMediaMessage/${instance}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
    },
    body: JSON.stringify({ message: { key: { id: messageId } } }),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const errorMsg = `HTTP ${response.status}: ${response.statusText}`;
    logger.error({
      correlation_id: correlationId,
      event: "media_download_failed",
      instance,
      error: errorMsg,
    });
    throw new Error(`Failed to download media: ${errorMsg}`);
  }

  const data = await response.json();

  logger.info({
    correlation_id: correlationId,
    event: "media_downloaded",
    instance,
    mimetype: data.mimetype,
  });

  return {
    base64: data.base64,
    mimetype: data.mimetype ?? "audio/ogg",
    fileName: data.fileName ?? "audio.ogg",
  };
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
