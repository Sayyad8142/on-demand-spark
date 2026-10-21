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
