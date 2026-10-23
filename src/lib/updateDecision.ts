/**
 * Worker App (Android only) update decisions.
 * The authority is the Admin Panel RPC `get_app_update_decision` (app=worker, platform=android).
 * This module only validates the server answer and applies local display rules
 * (defer during bookings, "Later" snooze). Never touches availability, bookings or notifications.
 */

/** Verified published package (Play listing returns 200; com.didinow.* return 404). */
export const WORKER_ANDROID_PACKAGE_ID = "app.didisnow.worker";
export const WORKER_PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${WORKER_ANDROID_PACKAGE_ID}`;

/** Snooze for "Later": until a newer build is published, or this long at most. */
export const SOFT_SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

/** Booking statuses during which mandatory blocking is deferred. */
export const ACTIVE_BOOKING_STATUSES = ["assigned", "accepted", "on_the_way", "started", "in_progress"] as const;

export type ServerDecision = "none" | "soft" | "force";

export interface UpdateAnswer {
  decision: ServerDecision;
  latestBuild: number | null;
  minBuild: number | null;
  latestVersion: string | null;
  storeUrl: string; // always the validated official listing
}

export interface SoftSnooze { build: number; until: number }

export type UpdateMode = "none" | "soft" | "force" | "force_deferred";

export function toBuild(v: unknown): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n > 0 ? n : null;
}

/** Accepts the server store_url only when it is the official Play listing of this package. */
export function safeStoreUrl(raw: unknown): string {
  if (typeof raw !== "string") return WORKER_PLAY_STORE_URL;
  try {
    const u = new URL(raw);
    if (u.protocol === "https:" && u.hostname === "play.google.com" && u.pathname === "/store/apps/details"
        && u.searchParams.get("id") === WORKER_ANDROID_PACKAGE_ID) return raw;
  } catch { /* fall through */ }
  return WORKER_PLAY_STORE_URL;
}

/**
 * Parses the RPC response. Malformed, unknown-target, wrong-app or unknown decisions → "none"
 * so a bad answer can never lock workers out.
 */
export function parseUpdateAnswer(raw: unknown): UpdateAnswer {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const okTarget = (r.app === undefined || r.app === "worker") && (r.platform === undefined || r.platform === "android");
  const d = r.decision;
  let decision: ServerDecision = okTarget && (d === "soft" || d === "force") ? d : "none";
  const minBuild = toBuild(r.min_build);
  const latestBuild = toBuild(r.latest_build);
  // A force answer must name a real minimum build, otherwise ignore it.
  if (decision === "force" && minBuild === null) decision = "none";
  return {
    decision,
    minBuild,
    latestBuild,
    latestVersion: typeof r.latest_version === "string" ? r.latest_version : null,
    storeUrl: safeStoreUrl(r.store_url),
  };
}

export function hasActiveBooking(status: string | null | undefined): boolean {
  return !!status && (ACTIVE_BOOKING_STATUSES as readonly string[]).includes(status);
}

export function isSoftSnoozed(snooze: SoftSnooze | null, latestBuild: number | null, now: number): boolean {
  return !!snooze && (latestBuild === null || snooze.build >= latestBuild) && now < snooze.until;
}

export function decideUpdate(args: {
  answer: UpdateAnswer | null;
  activeBookingStatus?: string | null;
  bookingAlertOpen?: boolean;
  snooze?: SoftSnooze | null;
  now: number;
}): UpdateMode {
  const { answer, activeBookingStatus, bookingAlertOpen = false, snooze = null, now } = args;
  if (!answer) return "none"; // offline / no answer yet: never block
  const busy = hasActiveBooking(activeBookingStatus);
  if (answer.decision === "force") return busy || bookingAlertOpen ? "force_deferred" : "force";
  if (answer.decision === "soft" && !busy && !bookingAlertOpen && !isSoftSnoozed(snooze, answer.latestBuild, now)) return "soft";
  return "none";
}

export function makeSnooze(latestBuild: number, now: number): SoftSnooze {
  return { build: latestBuild, until: now + SOFT_SNOOZE_MS };
}

/** Safety cap: an offer with no usable expiry stops counting as on-screen after this long. */
export const OFFER_ALERT_MAX_MS = 3 * 60 * 1000;

/**
 * True while a booking offer popup should be treated as on screen (optional update must stay hidden).
 * Uses the offer expiry when valid, otherwise a short cap from when it appeared. Display only.
 */
export function offerAlertActive(
  alert: { timeoutAt?: string | null } | null | undefined,
  shownAt: number | null,
  now: number,
): boolean {
  if (!alert) return false;
  const exp = alert.timeoutAt ? Date.parse(alert.timeoutAt) : NaN;
  const cap = (shownAt ?? now) + OFFER_ALERT_MAX_MS;
  return now < (Number.isFinite(exp) ? Math.min(exp, cap) : cap);
}
