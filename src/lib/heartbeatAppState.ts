/**
 * The live worker-heartbeat receiver accepts only "foreground" | "background" as app_state
 * (anything else → 400 invalid_request). The check-in reason travels separately.
 */
export type HeartbeatAppState = "foreground" | "background";

export function heartbeatAppState(reason: string, pageVisible: boolean): HeartbeatAppState {
  if (reason === "background") return "background";
  return pageVisible ? "foreground" : "background";
}
