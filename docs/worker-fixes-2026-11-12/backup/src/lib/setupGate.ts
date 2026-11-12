/**
 * Pure first-time setup decisions (no Capacitor imports) so they can be tested.
 * Display/flow only — never affects booking accept/reject, dispatch or payouts.
 */
export type SetupPermissionStatus = "granted" | "denied" | "missing" | "unknown" | "not_required";

export const isSatisfied = (s: SetupPermissionStatus | undefined) =>
  s === "granted" || s === "not_required";

/** What tapping the notification step should do. "denied" = Android won't show the prompt again. */
export function notificationAction(status: SetupPermissionStatus | undefined): "none" | "request" | "open_settings" {
  if (isSatisfied(status)) return "none";
  if (status === "denied") return "open_settings";
  return "request";
}

/** Setup screen must stay until BOTH booking alerts and popups are really on. */
export function isSetupBlocking(states: { notifications?: SetupPermissionStatus; overlay?: SetupPermissionStatus }): boolean {
  return !isSatisfied(states.notifications) || !isSatisfied(states.overlay);
}

// ---------- Battery "Later" ----------
export const BATTERY_SNOOZE_MS = 24 * 60 * 60 * 1000;
export interface KVStore { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

export const batterySnoozeKey = (userId: string) => `setup.batterySnoozeUntil.${userId}`;

export function snoozeBattery(store: KVStore, userId: string, now = Date.now()) {
  store.setItem(batterySnoozeKey(userId), String(now + BATTERY_SNOOZE_MS));
}

/** Full-screen battery prompt only when still missing AND not snoozed for this account. */
export function shouldShowBatteryPrompt(opts: { missing: boolean; userId?: string | null; store: KVStore; now?: number }): boolean {
  if (!opts.missing || !opts.userId) return false;
  const until = Number(opts.store.getItem(batterySnoozeKey(opts.userId)) ?? 0);
  return !(until > (opts.now ?? Date.now()));
}

/** Clears account-specific setup state for the account that signed out. Device permissions are untouched. */
export function clearAccountSetupState(store: KVStore, userId: string | null | undefined) {
  if (userId) store.removeItem(batterySnoozeKey(userId));
}

// ---------- Movement (activity) ----------
/** Ask at most once per account per app session, and only when the OS can still show the prompt. */
export function shouldRequestActivity(status: SetupPermissionStatus | undefined, alreadyAsked: boolean): boolean {
  if (alreadyAsked) return false;
  return status === "missing" || status === "unknown";
}

// ---------- Repeated taps ----------
/** Ignores calls while a previous call is still running. */
export function singleFlight<T>(fn: () => Promise<T>): () => Promise<T | undefined> {
  let running = false;
  return async () => {
    if (running) return undefined;
    running = true;
    try { return await fn(); } finally { running = false; }
  };
}

// ---------- Optional popups (approved option 2) ----------
/**
 * Setup blocks only on what booking notifications need. Popups (overlay) are optional:
 * the worker may tap "Continue with notifications". `overlayDeclined` is memory-only for
 * this app session — it is never treated as "granted" and never persisted.
 */
export function isSetupBlockingV2(s: {
  notifications?: SetupPermissionStatus;
  overlay?: SetupPermissionStatus;
  channel?: ChannelHealth;
  overlayDeclined?: boolean;
}): boolean {
  if (!isSatisfied(s.notifications)) return true;
  if (s.channel === "blocked") return true;
  if (!isSatisfied(s.overlay) && !s.overlayDeclined) return true;
  return false;
}

// ---------- Booking channel ----------
export type ChannelHealth = "ok" | "blocked" | "silent" | "missing" | "app_disabled" | "unknown" | "not_required";

export interface RawChannelStatus {
  appEnabled?: boolean; supported?: boolean; missing?: boolean; blocked?: boolean; silent?: boolean;
}

export function classifyChannel(raw: RawChannelStatus | null | undefined): ChannelHealth {
  if (!raw) return "unknown";
  if (raw.appEnabled === false) return "app_disabled";
  if (raw.supported === false) return "not_required";
  if (raw.missing) return "missing";
  if (raw.blocked) return "blocked";
  if (raw.silent) return "silent";
  return "ok";
}

// ---------- Alert readiness (display only; never changes availability/dispatch) ----------
export type AlertIssue =
  | "notifications_disabled"
  | "channel_blocked"
  | "channel_silent"
  | "popups_off"
  | "push_pending"
  | "push_failed";

export function alertIssues(s: {
  notifications?: SetupPermissionStatus;
  channel?: ChannelHealth;
  overlay?: SetupPermissionStatus;
  push?: "ok" | "pending" | "failed";
}): AlertIssue[] {
  const out: AlertIssue[] = [];
  if (!isSatisfied(s.notifications) || s.channel === "app_disabled") out.push("notifications_disabled");
  else if (s.channel === "blocked") out.push("channel_blocked");
  else if (s.channel === "silent") out.push("channel_silent");
  if (s.push === "failed") out.push("push_failed");
  else if (s.push === "pending") out.push("push_pending");
  if (!isSatisfied(s.overlay)) out.push("popups_off");
  return out;
}

/** "Fully working" can never be claimed from permission or a stored token alone. */
export function alertsVerified(issues: AlertIssue[], channel: ChannelHealth | undefined): boolean {
  return issues.filter((i) => i !== "popups_off").length === 0 && (channel === "ok" || channel === "not_required");
}
