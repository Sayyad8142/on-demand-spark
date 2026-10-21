/**
 * Worker reachability rules — pure, display-only in the Worker App.
 *
 * The same rules are the reference for the backend handoff
 * (docs/backend-reliability-handoff-2026-10-22.md): the watchdog and the
 * dispatcher live in the Supabase/Admin Panel project and are NOT changed
 * from here. Nothing in this file writes availability or eligibility.
 *
 *   Availability ON ≠ Connected ≠ Dispatch eligible ≠ Alert delivered.
 */

/** Native background heartbeat runs every 15 min (WorkManager minimum) and Android may defer it. */
export const BACKGROUND_HEARTBEAT_MIN = 15;
/** Connection is shown as "last connected …" after this long without a heartbeat. */
export const CONNECTION_STALE_MIN = 45;

export type ConnectionState = "connected" | "stale" | "unknown";

export function connectionState(lastHeartbeatAt: string | null | undefined, now = Date.now()): ConnectionState {
  if (!lastHeartbeatAt) return "unknown";
  const t = Date.parse(lastHeartbeatAt);
  if (!Number.isFinite(t)) return "unknown";
  return now - t <= CONNECTION_STALE_MIN * 60_000 ? "connected" : "stale";
}

/**
 * Proposed watchdog rule (backend handoff). A missing heartbeat only marks the
 * connection stale — it never switches availability OFF, and the watchdog
 * never switches a worker ON unless its own pause is the latest change.
 */
export type WatchdogAction = "none" | "pause_no_token" | "restore_own_pause";

export function watchdogDecision(w: {
  isAvailable: boolean;
  hasToken: boolean;
  tokenInvalid: boolean;
  autoPausedSource: string | null;
  lastAvailabilitySource: string | null;
}): WatchdogAction {
  const reachable = w.hasToken && !w.tokenInvalid;
  if (w.isAvailable) return reachable ? "none" : "pause_no_token";
  // OFF: only undo a pause the watchdog itself made, and only if nobody
  // (worker/admin) changed availability since.
  const ownPause = w.autoPausedSource === "watchdog" && w.lastAvailabilitySource === "system_auto_offline";
  return ownPause && reachable ? "restore_own_pause" : "none";
}

/** Proposed dispatch eligibility. Popup (overlay) permission is never a requirement. */
export type ExclusionReason =
  | "inactive_account" | "availability_off" | "busy" | "blocked" | "payout_not_ready"
  | "wrong_service" | "wrong_community" | "no_slot" | "no_push_token" | "push_token_invalid"
  | "notifications_denied";

export function dispatchExclusions(w: {
  isActive: boolean; isAvailable: boolean; isBusy: boolean; isBlocked: boolean;
  payoutReady: boolean; servesService: boolean; inCommunity: boolean; hasSlot: boolean;
  hasToken: boolean; tokenInvalid: boolean; notificationPermission: boolean | null;
  overlayPermission?: boolean | null;
}): ExclusionReason[] {
  const r: ExclusionReason[] = [];
  if (!w.isActive) r.push("inactive_account");
  if (!w.isAvailable) r.push("availability_off");
  if (w.isBusy) r.push("busy");
  if (w.isBlocked) r.push("blocked");
  if (!w.payoutReady) r.push("payout_not_ready");
  if (!w.servesService) r.push("wrong_service");
  if (!w.inCommunity) r.push("wrong_community");
  if (!w.hasSlot) r.push("no_slot");
  if (!w.hasToken) r.push("no_push_token");
  else if (w.tokenInvalid) r.push("push_token_invalid");
  if (w.notificationPermission === false) r.push("notifications_denied");
  return r;
}

export type AlertsState = "ready" | "attention" | "unknown";
export type EligibilityState = "eligible" | "not_eligible" | "checking";

export interface StatusSummary {
  availability: "on" | "off" | "unknown";
  alerts: AlertsState;
  connection: ConnectionState;
  notificationPermission: "enabled" | "disabled" | "unknown";
  eligibility: EligibilityState;
  /** Simple-language messages, most important first. */
  messages: string[];
}

/** Worker-facing summary. Never claims delivery is guaranteed. */
export function statusSummary(s: {
  isAvailable: boolean | null;
  isBusy?: boolean | null;
  isBlocked?: boolean | null;
  payoutReady?: boolean | null;
  online: boolean;
  native: boolean;
  permissionGranted: boolean | null;
  channelOk: boolean | null;
  tokenRegistered: boolean | null;
  lastHeartbeatAt: string | null;
  updateRequired?: boolean;
  now?: number;
}): StatusSummary {
  const messages: string[] = [];
  const perm = !s.native ? "enabled" : s.permissionGranted == null ? "unknown" : s.permissionGranted ? "enabled" : "disabled";
  if (s.updateRequired) messages.push("Your app needs to be updated.");
  if (!s.online) messages.push("Your internet connection is unavailable.");
  if (perm === "disabled") messages.push("Please enable notifications to receive booking alerts.");
  else if (s.native && s.channelOk === false) messages.push("Booking alerts are blocked in phone settings");
  if (s.native && s.tokenRegistered === false) messages.push("Booking alerts need to be registered. Open the app with internet access.");

  let alerts: AlertsState;
  if (!s.native) alerts = "unknown";
  else if (perm === "disabled" || s.channelOk === false || s.tokenRegistered === false) alerts = "attention";
  else if (perm === "unknown" || s.channelOk == null || s.tokenRegistered == null) alerts = "unknown";
  else alerts = "ready";

  const availability = s.isAvailable == null ? "unknown" : s.isAvailable ? "on" : "off";
  let eligibility: EligibilityState;
  if (s.isAvailable == null || s.payoutReady == null) eligibility = "checking";
  else if (!s.isAvailable || s.isBusy || s.isBlocked || !s.payoutReady || alerts === "attention" || s.updateRequired) eligibility = "not_eligible";
  else eligibility = "eligible";

  if (availability === "off") messages.push("You are OFF. Turn ON to get bookings.");
  if (s.payoutReady === false) messages.push("Payout setup pending");

  return {
    availability,
    alerts,
    connection: connectionState(s.lastHeartbeatAt, s.now),
    notificationPermission: perm,
    eligibility,
    messages: messages.slice(0, 3),
  };
}
