// STAGED — not deployed. Pure payload builders + the exact acceptance rules
// of send-fcm (mirrors supabase/functions/send-fcm/index.ts lines 72-92, plus
// the staged PING silent branch). No network, no secrets.

export interface SendFcmPayload {
  workerIds: string[];
  title: string;
  body: string;
  data: Record<string, string>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Types send-fcm delivers data-only (no visible tray notification). */
export const SILENT_TYPES = new Set(["PING"]);

/** Same checks send-fcm runs before sending. null = accepted. */
export function validateSendFcmPayload(p: unknown): string | null {
  const x = p as Partial<SendFcmPayload> | null;
  if (!x || !Array.isArray(x.workerIds) || x.workerIds.length === 0) return "Invalid workerIds";
  if (!x.workerIds.every((id) => typeof id === "string" && UUID.test(id))) return "Invalid worker ID format";
  if (!x.title || !x.body) return "Missing title or body";
  return null;
}

export type PauseReason = "stale_heartbeat" | "no_fcm_token" | "fcm_token_invalid" | "notification_unhealthy" | "repeated_missed";

/** Watchdog pause notice. Uses the worker's id — send-fcm looks the token up itself. */
export function buildWorkerPausedPayload(workerId: string, reason: PauseReason, title: string, body: string): SendFcmPayload {
  return {
    workerIds: [workerId],
    title,
    body,
    data: { type: "WORKER_PAUSED", reason, actionable: "false", offer_kind: "worker_notice" },
  };
}

/** Silent keep-alive. Title/body only satisfy validation; PING is sent data-only. */
export function buildKeepalivePingPayload(workerIds: string[], nowMs: number): SendFcmPayload {
  return {
    workerIds,
    title: "keepalive",
    body: "keepalive",
    data: { type: "PING", ts: String(nowMs), actionable: "false" },
  };
}

/** Whether send-fcm (staged) omits the visible notification block. */
export function isSilent(data: Record<string, string> | undefined): boolean {
  return SILENT_TYPES.has(String(data?.type ?? ""));
}
