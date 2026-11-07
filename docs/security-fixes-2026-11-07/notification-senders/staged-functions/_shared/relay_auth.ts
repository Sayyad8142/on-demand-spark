// STAGED — NOT DEPLOYED. Caller rule for the functions that ASK send-fcm to
// notify workers (booking-notifications, notify-next-tier, fcm-keepalive,
// worker-health-watchdog). Without this, an anonymous caller could skip the
// send-fcm guard by calling one of these relays, which then use the service key.
import type { VerifiedCaller } from "./notify_auth.ts";

export type Relay = "booking-notifications" | "notify-next-tier" | "fcm-keepalive" | "worker-health-watchdog";

export interface RelayState {
  /** notify-next-tier only: server re-read shows booking still unassigned, and
   *  a confirmed rejection (should_notify) for this tier exists in the last 5 min. */
  redispatchVerified?: boolean;
}

export type RelayDecision = { allow: true; reason: string } | { allow: false; status: 401 | 403; reason: string };

export function decideRelayAccess(relay: Relay, caller: VerifiedCaller | null, state: RelayState = {}): RelayDecision {
  if (caller?.internalKeyValid) return { allow: true, reason: "internal_key" };
  if (caller?.role === "service_role") return { allow: true, reason: "service_role" };
  if (caller?.role === "authenticated" && caller.isAdmin) return { allow: true, reason: "admin" };
  // Worker app rejection: caller identity can't be proven (Firebase login), so the
  // server state itself must prove a real rejection happened. Never trust the body.
  if (relay === "notify-next-tier" && state.redispatchVerified === true) {
    return { allow: true, reason: "verified_rejection" };
  }
  if (!caller || !caller.role) return { allow: false, status: 401, reason: "no_verified_token" };
  return { allow: false, status: 403, reason: `relay_${relay}_${caller.role}` };
}
