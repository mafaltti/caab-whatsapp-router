export interface NormalizedMessage {
  userId: string;
  messageId: string;
  instanceName: string;
  text: string;
  fromMe: boolean;
  isGroup: boolean;
  remoteJid: string;
  timestamp: Date;
  mediaType?: "audio" | null;
}

export interface GuardResult {
  shouldProcess: boolean;
  reason?: string;
  requiresAutoReply: boolean;
  autoReplyText?: string;
  requiresAudioTranscription?: boolean;
}
