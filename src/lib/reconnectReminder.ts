/**
 * Worker reconnection reminder — pure rules (Step 1, switch OFF).
 * Display/decision helpers only. Never changes availability, dispatch or bookings.
 * The server job (staged, not applied) mirrors these same rules.
 */

/** Master client switch. Keep false until owner GO for Step 3+. */
export const RECONNECT_REMINDER_ENABLED = false;

export const RECONNECT_INTERVAL_MS = 72 * 60 * 60 * 1000;
export const VERIFIED_OPEN_DEBOUNCE_MS = 10 * 60 * 1000;
export const WINDOW_START_HOUR_IST = 10; // inclusive
export const WINDOW_END_HOUR_IST = 18; // exclusive
export const SCHEDULE_LOOKAHEAD_DAYS = 7;
export const RECONNECT_ROUTE = "/reconnect";
export const RECONNECT_PUSH_TYPE = "RECONNECT_REMINDER";

const IST_OFFSET_MS = 330 * 60 * 1000;

export function istHour(now: Date): number {
  return new Date(now.getTime() + IST_OFFSET_MS).getUTCHours();
}

export function isInReminderWindow(now: Date): boolean {
  const h = istHour(now);
  return h >= WINDOW_START_HOUR_IST && h < WINDOW_END_HOUR_IST;
}

/** Only a real foreground + visible screen counts as an app open. */
export function isVerifiedAppOpen(input: { appActive: boolean; documentVisible: boolean; source: string }): boolean {
  if (!input.appActive || !input.documentVisible) return false;
  return input.source === "app_state_active" || input.source === "cold_start";
}

export function shouldRecordVerifiedOpen(lastRecordedMs: number | null, nowMs: number): boolean {
  return lastRecordedMs == null || nowMs - lastRecordedMs >= VERIFIED_OPEN_DEBOUNCE_MS;
}

export type ReminderInput = {
  now: Date;
  isGuest: boolean;
  lastVerifiedOpenAt: string | null;
  lastReminderAt: string | null;
  rolloutAt: string; // reminders never fire before 72h after rollout
  pausedByWorker: boolean;
  pausedByAdmin: boolean;
  hasSlotsNext7Days: boolean;
  fcmTokenStatus: string | null; // "active" = usable
  hasFcmToken: boolean;
};

export type ReminderDecision =
  | { action: "none"; reason: string }
  | { action: "send_reminder" }
  | { action: "admin_followup"; reason: "missing_fcm_token" | "invalid_fcm_token" };

const ms = (iso: string | null) => (iso ? Date.parse(iso) : NaN);

export function decideReconnectReminder(i: ReminderInput): ReminderDecision {
  if (i.isGuest) return { action: "none", reason: "guest" };
  if (i.pausedByWorker || i.pausedByAdmin) return { action: "none", reason: "paused" };
  if (!i.hasSlotsNext7Days) return { action: "none", reason: "not_scheduled" };

  const nowMs = i.now.getTime();
  const rollout = ms(i.rolloutAt);
  if (!Number.isFinite(rollout) || nowMs - rollout < RECONNECT_INTERVAL_MS) return { action: "none", reason: "rollout_grace" };

  const open = ms(i.lastVerifiedOpenAt);
  if (Number.isFinite(open) && nowMs - open < RECONNECT_INTERVAL_MS) return { action: "none", reason: "recently_opened" };

  const last = ms(i.lastReminderAt);
  if (Number.isFinite(last) && nowMs - last < RECONNECT_INTERVAL_MS) return { action: "none", reason: "frequency_cap" };

  // Token problems go to admin regardless of the time of day.
  if (!i.hasFcmToken) return { action: "admin_followup", reason: "missing_fcm_token" };
  if (i.fcmTokenStatus !== "active") return { action: "admin_followup", reason: "invalid_fcm_token" };

  if (!isInReminderWindow(i.now)) return { action: "none", reason: "outside_window" };
  return { action: "send_reminder" };
}

/** In-app red screen only when the switch is on and the worker came from the reminder. */
export function shouldShowReconnectScreen(input: { enabled: boolean; isGuest: boolean; fromReminder: boolean }): boolean {
  return input.enabled && !input.isGuest && input.fromReminder;
}
