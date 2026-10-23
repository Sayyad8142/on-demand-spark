/**
 * Single source of truth for Worker App (Android only) update decisions.
 * Pure: no I/O. Numeric Android build numbers only — version names are display-only.
 * Never touches availability, bookings or notifications.
 */

/** Verified published package (Play listing returns 200; com.didinow.* return 404). */
export const WORKER_ANDROID_PACKAGE_ID = "app.didisnow.worker";
export const WORKER_PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${WORKER_ANDROID_PACKAGE_ID}`;

/** Snooze for "Later": until a newer build is published, or this long at most. */
export const SOFT_SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

/** Booking statuses during which mandatory blocking is deferred. */
export const ACTIVE_BOOKING_STATUSES = ["assigned", "accepted", "on_the_way", "started", "in_progress"] as const;

export interface UpdatePolicy {
  minBuild: number | null;      // min_worker_version_code
  latestBuild: number | null;   // latest_worker_version_code
  latestName: string | null;    // display only
  hardEnabled: boolean;         // worker_hard_update_enabled
  softEnabled: boolean;         // worker_soft_update_enabled
}

export interface SoftSnooze { build: number; until: number }

export type UpdateMode = "none" | "soft" | "force" | "force_deferred";

export function toBuild(v: unknown): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n > 0 ? n : null;
}

/** Maps an app_config row; ignores per-release store URLs and legacy shared flags. */
export function policyFromConfig(row: Record<string, unknown> | null | undefined): UpdatePolicy {
  return {
    minBuild: toBuild(row?.min_worker_version_code),
    latestBuild: toBuild(row?.latest_worker_version_code),
    latestName: typeof row?.latest_worker_version_name === "string" ? row.latest_worker_version_name : null,
    hardEnabled: row?.worker_hard_update_enabled === true,
    softEnabled: row?.worker_soft_update_enabled === true,
  };
}

export function hasActiveBooking(status: string | null | undefined): boolean {
  return !!status && (ACTIVE_BOOKING_STATUSES as readonly string[]).includes(status);
}

export function isSoftSnoozed(snooze: SoftSnooze | null, latestBuild: number, now: number): boolean {
  return !!snooze && snooze.build >= latestBuild && now < snooze.until;
}

export function decideUpdate(args: {
  installedBuild: number;
  policy: UpdatePolicy | null;
  activeBookingStatus?: string | null;
  snooze?: SoftSnooze | null;
  now: number;
}): UpdateMode {
  const { installedBuild, policy, activeBookingStatus, snooze = null, now } = args;
  if (!policy || !toBuild(installedBuild)) return "none";
  const busy = hasActiveBooking(activeBookingStatus);

  if (policy.hardEnabled && policy.minBuild !== null && installedBuild < policy.minBuild) {
    return busy ? "force_deferred" : "force";
  }
  if (
    policy.softEnabled &&
    policy.latestBuild !== null &&
    installedBuild < policy.latestBuild &&
    !busy &&
    !isSoftSnoozed(snooze, policy.latestBuild, now)
  ) {
    return "soft";
  }
  return "none";
}

export function makeSnooze(latestBuild: number, now: number): SoftSnooze {
  return { build: latestBuild, until: now + SOFT_SNOOZE_MS };
}
