import { supabase } from "./supabase";

export interface ChatMessage {
  id: number;
  userId: string;
  instance: string;
  direction: "in" | "out";
  messageId: string | null;
  text: string | null;
  createdAt: string;
}

/**
 * Inserts an inbound message if the message_id is not already present.
 * Returns true if inserted (new message), false if duplicate.
 */
export async function insertInboundIfNew(
  messageId: string,
  userId: string,
  instance: string,
  text: string | null,
): Promise<boolean> {
  const { error } = await supabase.from("chat_messages").insert({
    user_id: userId,
    instance,
    direction: "in",
    message_id: messageId,
    text,
  });

  if (error) {
    // 23505 = unique_violation (duplicate message_id)
    if (error.code === "23505") return false;
    throw error;
  }

  return true;
}

export async function insertOutbound(
  userId: string,
  instance: string,
  text: string,
): Promise<void> {
  const { error } = await supabase.from("chat_messages").insert({
    user_id: userId,
    instance,
    direction: "out",
    message_id: null,
    text,
  });

  if (error) throw error;
}

export async function loadRecentMessages(
  userId: string,
  limit: number = 5,
): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("chat_messages")
    .select()
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  // Reverse to chronological order (oldest first) for LLM context
  return data.reverse().map((row) => ({
    id: row.id,
    userId: row.user_id,
    instance: row.instance,
    direction: row.direction as "in" | "out",
    messageId: row.message_id,
    text: row.text,
    createdAt: row.created_at,
  }));
}
