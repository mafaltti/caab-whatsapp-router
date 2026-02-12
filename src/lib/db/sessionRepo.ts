import { supabase } from "./supabase";
import type { Json } from "./types";

export interface SessionState {
  userId: string;
  instance: string;
  activeFlow: string | null;
  activeSubroute: string | null;
  step: string;
  data: Record<string, unknown>;
  updatedAt: string;
  expiresAt: string;
}

export async function getSession(
  userId: string,
): Promise<SessionState | null> {
  const { data, error } = await supabase
    .from("conversation_state")
    .select()
    .eq("user_id", userId)
    .single();

  if (error) {
    // PGRST116 = no rows found
    if (error.code === "PGRST116") return null;
    throw error;
  }

  // Check expiry — if expired, delete and treat as no session
  if (new Date(data.expires_at) <= new Date()) {
    await clearSession(userId);
    return null;
  }

  return {
    userId: data.user_id,
    instance: data.instance,
    activeFlow: data.active_flow,
    activeSubroute: data.active_subroute,
    step: data.step,
    data: data.data as Record<string, unknown>,
    updatedAt: data.updated_at,
    expiresAt: data.expires_at,
  };
}

export async function upsertSession(
  session: Pick<
    SessionState,
    "userId" | "instance" | "activeFlow" | "activeSubroute" | "step" | "data"
  >,
): Promise<void> {
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  const { error } = await supabase.from("conversation_state").upsert(
    {
      user_id: session.userId,
      instance: session.instance,
      active_flow: session.activeFlow,
      active_subroute: session.activeSubroute,
      step: session.step,
      data: session.data as Json,
      updated_at: now,
      expires_at: expiresAt,
    },
    { onConflict: "user_id" },
  );

  if (error) throw error;
}

export async function clearSession(userId: string): Promise<void> {
  const { error } = await supabase
    .from("conversation_state")
    .delete()
    .eq("user_id", userId);

  if (error) throw error;
}
