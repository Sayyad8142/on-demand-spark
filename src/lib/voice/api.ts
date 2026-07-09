// Client wrappers for the Voice Assistant edge functions.
// All calls include the current Supabase JWT so the server can identify the worker.
import { supabase } from "@/integrations/supabase/client";
import { getSupabaseUrl } from "@/config/env";

const FUNCTIONS_BASE = `${getSupabaseUrl()}/functions/v1`;

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function transcribeAudio(wav: Blob, languageHint?: string): Promise<{ text: string }> {
  const fd = new FormData();
  fd.append("file", wav, "recording.wav");
  if (languageHint) fd.append("language", languageHint);
  const res = await fetch(`${FUNCTIONS_BASE}/voice-stt`, {
    method: "POST",
    headers: { ...(await authHeader()) },
    body: fd,
  });
  if (!res.ok) {
    const details = await res.text().catch(() => "");
    throw new Error(`STT failed (${res.status}): ${details.slice(0, 200)}`);
  }
  const payload = await res.json();
  return { text: String(payload?.text ?? "").trim() };
}

export async function synthesizeSpeech(text: string, language: string): Promise<Blob> {
  const res = await fetch(`${FUNCTIONS_BASE}/voice-tts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeader()),
    },
    body: JSON.stringify({ text, language, voice: "alloy" }),
  });
  if (!res.ok) {
    const details = await res.text().catch(() => "");
    throw new Error(`TTS failed (${res.status}): ${details.slice(0, 200)}`);
  }
  return await res.blob();
}

export type AssistantTurn = { role: "user" | "assistant"; content: string };
export type PendingAction =
  | { type: "update_upi" | "update_name"; value: string; spoken_confirmation: string }
  | { type: "set_online" | "set_offline"; value?: string; spoken_confirmation: string }
  | { type: "accept_booking" | "reject_booking"; bookingId: string; spoken_confirmation: string };

export type AssistantResponse = {
  reply: string;
  conversationId: string | null;
  navigate: string[];
  formPatch?: Record<string, string>;
  pendingAction?: PendingAction | null;
  language: string;
};

export type AssistantMode = "chat" | "signup" | "tour" | "booking_offer" | "briefing" | "summary" | "coach" | "active_job";

export async function askAssistant(params: {
  messages: AssistantTurn[];
  conversationId?: string | null;
  language: string;
  mode?: AssistantMode;
  context?: Record<string, unknown>;
}): Promise<AssistantResponse> {
  const res = await fetch(`${FUNCTIONS_BASE}/voice-assistant`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeader()),
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const details = await res.text().catch(() => "");
    throw new Error(`Assistant failed (${res.status}): ${details.slice(0, 200)}`);
  }
  return await res.json();
}


