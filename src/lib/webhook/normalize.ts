import { z } from "zod/v4";
import type { NormalizedMessage, GuardResult } from "@/lib/shared/types";

const MEDIA_AUTO_REPLY =
  "Por favor, envie sua mensagem em formato de texto ou áudio. No momento não consigo processar imagens, vídeos ou documentos.";

const EvolutionMessageSchema = z.object({
  conversation: z.string().optional(),
  extendedTextMessage: z
    .object({
      text: z.string(),
      contextInfo: z
        .object({
          quotedMessage: z.unknown().optional(),
        })
        .optional(),
    })
    .optional(),
  imageMessage: z.unknown().optional(),
  audioMessage: z.unknown().optional(),
  videoMessage: z.unknown().optional(),
  documentMessage: z.unknown().optional(),
  stickerMessage: z.unknown().optional(),
  locationMessage: z.unknown().optional(),
  contactMessage: z.unknown().optional(),
});

const EvolutionWebhookSchema = z.object({
  event: z.string(),
  instance: z.string(),
  data: z.object({
    key: z.object({
      remoteJid: z.string(),
      fromMe: z.boolean(),
      id: z.string(),
    }),
    message: EvolutionMessageSchema.optional(),
    messageTimestamp: z.union([z.number(), z.string()]).optional(),
  }),
});

export type EvolutionWebhookPayload = z.infer<typeof EvolutionWebhookSchema>;

type MessageType = "text" | "audio" | "media" | "sticker" | "unknown";

function getMessageType(
  message: z.infer<typeof EvolutionMessageSchema> | undefined,
): MessageType {
  if (!message) return "unknown";

  if (message.conversation || message.extendedTextMessage?.text) return "text";
  if (message.audioMessage) return "audio";
  if (message.stickerMessage) return "sticker";
  if (
    message.imageMessage ||
    message.videoMessage ||
    message.documentMessage ||
    message.locationMessage ||
    message.contactMessage
  )
    return "media";

  return "unknown";
}

export function normalizeMessage(payload: unknown): NormalizedMessage | null {
  const result = EvolutionWebhookSchema.safeParse(payload);
  if (!result.success) return null;

  const { data } = result;
  const { key, message, messageTimestamp } = data.data;

  const rawText =
    message?.conversation ?? message?.extendedTextMessage?.text ?? "";
  const text = rawText.trim().replace(/\s+/g, " ");

  const isGroup =
    key.remoteJid.endsWith("@g.us") || key.remoteJid.endsWith("@lid");
  const userId = key.remoteJid.split("@")[0].replace(/\D/g, "");
  if (!userId) return null;

  let timestamp: Date;
  if (messageTimestamp) {
    const ts =
      typeof messageTimestamp === "string"
        ? parseInt(messageTimestamp, 10)
        : messageTimestamp;
    timestamp = new Date(ts * 1000);
  } else {
    timestamp = new Date();
  }

  const messageType = getMessageType(message);

  return {
    userId,
    messageId: key.id,
    instanceName: data.instance,
    text,
    fromMe: key.fromMe,
    isGroup,
    remoteJid: key.remoteJid,
    timestamp,
    ...(messageType === "audio" && { mediaType: "audio" as const }),
  };
}

export function applyGuards(
  message: NormalizedMessage,
  rawPayload: EvolutionWebhookPayload,
): GuardResult {
  if (message.fromMe) {
    return { shouldProcess: false, reason: "fromMe", requiresAutoReply: false };
  }

  if (message.isGroup) {
    return {
      shouldProcess: false,
      reason: "group_message",
      requiresAutoReply: false,
    };
  }

  const messageType = getMessageType(rawPayload.data.message);

  if (messageType === "audio") {
    return {
      shouldProcess: true,
      requiresAutoReply: false,
      requiresAudioTranscription: true,
    };
  }

  if (messageType !== "text") {
    if (messageType === "sticker") {
      return {
        shouldProcess: false,
        reason: "sticker",
        requiresAutoReply: false,
      };
    }

    if (messageType === "media") {
      return {
        shouldProcess: false,
        reason: "media_message",
        requiresAutoReply: true,
        autoReplyText: MEDIA_AUTO_REPLY,
      };
    }

    return {
      shouldProcess: false,
      reason: "unknown_message_type",
      requiresAutoReply: false,
    };
  }

  if (!message.text) {
    return {
      shouldProcess: false,
      reason: "empty_text",
      requiresAutoReply: false,
    };
  }

  return { shouldProcess: true, requiresAutoReply: false };
}
