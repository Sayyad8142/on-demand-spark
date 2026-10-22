/**
 * Worker Focus diagnostics — pure, display/report-only rules.
 *
 * Nothing here switches availability, changes eligibility, ranking, busy
 * state or dispatch. Every status carries the timestamp it is based on, and
 * nothing claims a cause that cannot be verified (e.g. "phone switched off").
 * All timestamps are UTC ISO strings; IST is a display concern only.
 */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function parse(ts: string | null | undefined): number | null {
  if (!ts) return null;
  const t = Date.parse(ts);
  return Number.isFinite(t) ? t : null;
}

/* ---------------- 3. Activity / inactivity ---------------- */

export type ActivityBucket =
  | "active_15m" | "active_1h" | "active_today"
  | "inactive_1d" | "inactive_2d" | "inactive_3d" | "inactive_7d" | "unknown";

/** Uses the latest real connection timestamp. Never implies OFF/blocked. */
export function activityBucket(lastConnectionAt: string | null | undefined, now = Date.now()): ActivityBucket {
  const t = parse(lastConnectionAt);
  if (t == null) return "unknown";
  const age = Math.max(0, now - t);
  if (age <= 15 * MIN) return "active_15m";
  if (age <= HOUR) return "active_1h";
  if (age < DAY) return "active_today";
  if (age < 2 * DAY) return "inactive_1d";
  if (age < 3 * DAY) return "inactive_2d";
  if (age < 7 * DAY) return "inactive_3d";
  return "inactive_7d";
}

/* ---------------- 2D. Device reachability ---------------- */

export type DeviceReach = "connected" | "last_seen" | "unreachable_unknown" | "never_seen";
export const DEVICE_UNREACHABLE_LABEL = "Device unreachable — reason unknown";
/** Matches workerReachability CONNECTION_STALE_MIN (native heartbeat is ≥15 min and may be deferred). */
export const REACH_STALE_MIN = 45;
export const REACH_UNREACHABLE_HOURS = 6;

export function deviceReach(lastConnectionAt: string | null | undefined, now = Date.now()): DeviceReach {
  const t = parse(lastConnectionAt);
  if (t == null) return "never_seen";
  const age = now - t;
  if (age <= REACH_STALE_MIN * MIN) return "connected";
  if (age <= REACH_UNREACHABLE_HOURS * HOUR) return "last_seen";
  return "unreachable_unknown";
}

/* ---------------- 2A. Network ---------------- */

/** The phone is only "online" when it actually reached the server recently. */
export function networkState(input: { browserOnline: boolean; lastServerOkAt: string | null; now?: number }): "online" | "no_internet" | "server_unreachable" | "unknown" {
  if (!input.browserOnline) return "no_internet";
  const t = parse(input.lastServerOkAt);
  if (t == null) return "unknown";
  return (input.now ?? Date.now()) - t <= 10 * MIN ? "online" : "server_unreachable";
}

/* ---------------- 2C. Session ---------------- */

export type SessionEnd = "explicit_logout" | "session_expired" | "none";
/** Only an explicit tap on Log out is a confirmed logout. */
export function sessionEnd(input: { explicitLogout: boolean; hasSession: boolean }): SessionEnd {
  if (input.explicitLogout) return "explicit_logout";
  if (!input.hasSession) return "session_expired";
  return "none";
}

/* ---------------- 2E. Slots ---------------- */

export type SlotState = "none_configured" | "invalid" | "current_selected" | "current_not_selected" | "outside_hours" | "unknown";

const SLOT_RE = /^([01]\d|2[0-3]):(00|30)(:00)?$/;
const FIRST_SLOT_MIN = 7 * 60;   // 07:00 IST
const LAST_SLOT_MIN = 19 * 60;   // 19:00 IST

/** IST weekday (0=Sun) and minutes since midnight, independent of device timezone. */
export function istClock(now = Date.now()): { day: number; minutes: number } {
  const ist = new Date(now + 330 * MIN);
  return { day: ist.getUTCDay(), minutes: ist.getUTCHours() * 60 + ist.getUTCMinutes() };
}

/**
 * Selected working slots, reported separately from booking eligibility.
 * rows = worker_availability rows (day_of_week 0–6, slots "HH:MM[:SS]").
 */
export function slotState(rows: { day_of_week: number; slots: string[] | null }[] | null, now = Date.now()): SlotState {
  if (rows == null) return "unknown";
  const all = rows.flatMap((r) => r.slots ?? []);
  if (all.length === 0) return "none_configured";
  if (rows.some((r) => r.day_of_week < 0 || r.day_of_week > 6) || all.some((s) => !SLOT_RE.test(s))) return "invalid";
  const { day, minutes } = istClock(now);
  if (minutes < FIRST_SLOT_MIN || minutes > LAST_SLOT_MIN) return "outside_hours";
  const half = Math.floor(minutes / 30) * 30;
  const key = `${String(Math.floor(half / 60)).padStart(2, "0")}:${String(half % 60).padStart(2, "0")}`;
  const today = rows.filter((r) => r.day_of_week === day).flatMap((r) => r.slots ?? []);
  return today.some((s) => s.slice(0, 5) === key) ? "current_selected" : "current_not_selected";
}

/* ---------------- 2B/2F. Offer delivery ---------------- */

export type OfferDiagnosis =
  | "no_offers_sent"          // dispatcher did not pick her — NOT a notification problem
  | "sent_not_confirmed"      // server sent, phone never confirmed receipt
  | "received_popup_missing"  // phone confirmed, popup not confirmed (popups are optional)
  | "delivered"
  | "unknown";

export function offerDiagnosis(e: { sent: number; received: number; popupShown: number; evidenceAvailable: boolean }): OfferDiagnosis {
  if (!e.evidenceAvailable) return "unknown";
  if (e.sent === 0) return "no_offers_sent";
  if (e.received === 0) return "sent_not_confirmed";
  if (e.popupShown < e.received) return "received_popup_missing";
  return "delivered";
}

/** A notification problem needs evidence from the phone, never just "no offers". */
export function isNotificationProblem(d: { permission: "granted" | "denied" | "unknown"; tokenRegistered: boolean | null; offer: OfferDiagnosis }): boolean {
  return d.permission === "denied" || d.tokenRegistered === false || d.offer === "sent_not_confirmed";
}

/* ---------------- 6. Worker self-help ---------------- */

export type SelfHelpCode =
  | "notifications_disabled" | "no_internet" | "server_unavailable" | "push_registration_failed"
  | "session_expired" | "no_working_slot";
export type SelfHelpAction = "open_notification_settings" | "check_internet" | "retry" | "retry_registration" | "log_in" | "select_slots";

export interface SelfHelpItem { code: SelfHelpCode; message: string; action: SelfHelpAction; actionLabel: string }

export const NOTIFICATIONS_DISABLED_MESSAGE = "Booking alerts are disabled. Please enable notifications to receive new bookings.";

export function selfHelp(s: {
  network: ReturnType<typeof networkState>;
  permission: "granted" | "denied" | "unknown";
  tokenRegistered: boolean | null;
  session: SessionEnd;
  slots: SlotState;
}): SelfHelpItem[] {
  const out: SelfHelpItem[] = [];
  if (s.session === "session_expired") out.push({ code: "session_expired", message: "Your session has expired.", action: "log_in", actionLabel: "Log in again" });
  if (s.network === "no_internet") out.push({ code: "no_internet", message: "Your internet connection is unavailable.", action: "check_internet", actionLabel: "Check internet connection" });
  else if (s.network === "server_unavailable") out.push({ code: "server_unavailable", message: "Could not connect to Didi Now.", action: "retry", actionLabel: "Retry" });
  if (s.permission === "denied") out.push({ code: "notifications_disabled", message: NOTIFICATIONS_DISABLED_MESSAGE, action: "open_notification_settings", actionLabel: "Open notification settings" });
  if (s.tokenRegistered === false) out.push({ code: "push_registration_failed", message: "Booking alerts are not registered.", action: "retry_registration", actionLabel: "Retry registration" });
  if (s.slots === "none_configured" || s.slots === "invalid") out.push({ code: "no_working_slot", message: "No working slots selected.", action: "select_slots", actionLabel: "Select working slots" });
  return out;
}

/** "Everything is working" only when every check is known and fine. */
export function allChecksKnownAndOk(s: Parameters<typeof selfHelp>[0]): boolean {
  return selfHelp(s).length === 0 && s.network === "online" && s.permission === "granted" && s.tokenRegistered === true && s.slots !== "unknown";
}

/* ---------------- 5. Diagnostic event queue ---------------- */

export type DiagnosticKind =
  | "snapshot" | "network_lost" | "network_restored" | "explicit_logout"
  | "push_registration_failed" | "push_token_refreshed" | "notification_permission";

export interface DiagnosticEvent {
  /** Dedupe key: kind + observed second (+ optional subject). */
  id: string;
  kind: DiagnosticKind;
  /** UTC ISO time the phone observed it (not send time). */
  observed_at: string;
  data: Record<string, string | number | boolean | null>;
}

const FORBIDDEN_KEYS = /token|secret|password|jwt|authorization|session/i;

export function makeEvent(kind: DiagnosticKind, data: DiagnosticEvent["data"] = {}, now = Date.now(), subject = ""): DiagnosticEvent {
  const clean: DiagnosticEvent["data"] = {};
  for (const [k, v] of Object.entries(data)) {
    // Booleans like token_registered are status, not the token itself.
    if (FORBIDDEN_KEYS.test(k) && typeof v === "string") continue;
    clean[k] = v;
  }
  const observed = new Date(Math.floor(now / 1000) * 1000).toISOString();
  return { id: `${kind}:${observed}${subject ? `:${subject}` : ""}`, kind, observed_at: observed, data: clean };
}

export const QUEUE_MAX = 50;

/** Dedupe by id, keep newest QUEUE_MAX, oldest first. */
export function enqueue(queue: DiagnosticEvent[], ev: DiagnosticEvent): DiagnosticEvent[] {
  if (queue.some((q) => q.id === ev.id)) return queue;
  return [...queue, ev].sort((a, b) => a.observed_at.localeCompare(b.observed_at)).slice(-QUEUE_MAX);
}

/** Server-side rule mirrored here: a delayed report never overwrites newer status. */
export function acceptsUpdate(currentObservedAt: string | null, incomingObservedAt: string): boolean {
  const cur = parse(currentObservedAt);
  const inc = parse(incomingObservedAt);
  if (inc == null) return false;
  return cur == null || inc > cur;
}

/** Throttle snapshots so heartbeats do not cause excessive writes. */
export const SNAPSHOT_MIN_INTERVAL_MS = 15 * MIN;
export function shouldSendSnapshot(lastSentAt: number | null, now = Date.now(), changed = false): boolean {
  if (changed) return true;
  return lastSentAt == null || now - lastSentAt >= SNAPSHOT_MIN_INTERVAL_MS;
}
