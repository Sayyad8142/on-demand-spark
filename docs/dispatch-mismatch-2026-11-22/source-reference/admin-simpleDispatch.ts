// Admin preview copy of the staged simplified dispatch rules (docs/simple-dispatch-20261101/staged). Keep in sync.
// Rule: AVAILABLE + MATCHING SLOT (+ community/service + safety guards) -> SORT BY RATING -> NEXT UNOFFERED BATCH.

export interface SimpleWorker {
  id: string;
  full_name?: string;
  is_active: boolean;          // account safety (not a ranking signal)
  is_blocked: boolean;         // account safety
  is_available: boolean;       // condition 1
  is_busy: boolean;            // overlapping-booking protection
  communities: string[];
  service_types: string[];
  slots_for_day: string[];     // 'HH:MM:SS' entries for the booking's IST weekday
  rating: number | null;       // customer rating only
  total_ratings?: number | null;
  fcm_token?: string | null;   // NOT an eligibility filter; delivery result recorded instead
}

export type ExclusionReason =
  | "availability_off" | "slot_unavailable" | "community_mismatch" | "service_mismatch"
  | "account_inactive" | "account_blocked" | "busy_other_booking";

/** Neutral sort key for unrated workers. Used for ORDER only, never shown as a rating. */
export const NEUTRAL_SORT_RATING = 4.0;

export function toSlot(hhmm: string): string {
  const [h, m = "0"] = hhmm.split(":");
  return `${h.padStart(2, "0")}:${Number(m) >= 30 ? "30" : "00"}:00`;
}

export function exclusionReasons(w: SimpleWorker, community: string, service: string, slot: string): ExclusionReason[] {
  const r: ExclusionReason[] = [];
  if (!w.communities.includes(community)) r.push("community_mismatch");
  if (!w.service_types.includes(service)) r.push("service_mismatch");
  if (!w.is_available) r.push("availability_off");
  if (!w.slots_for_day.includes(toSlot(slot))) r.push("slot_unavailable");
  if (!w.is_active) r.push("account_inactive");
  if (w.is_blocked) r.push("account_blocked");
  if (w.is_busy) r.push("busy_other_booking");
  return r;
}

export function hasRealRating(w: SimpleWorker): boolean {
  if (w.rating == null) return false;
  if (w.total_ratings != null && Number(w.total_ratings) <= 0) return false;
  return true;
}

export function sortKey(w: SimpleWorker): number {
  return hasRealRating(w) ? Number(w.rating) : NEUTRAL_SORT_RATING;
}

/** Highest rating first; ties broken by worker id (deterministic). */
export function rankByRating<T extends SimpleWorker>(ws: T[]): T[] {
  return [...ws].sort((a, b) => {
    const d = Math.round(sortKey(b) * 100) - Math.round(sortKey(a) * 100);
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });
}

export interface Selection<T> { ordered: T[]; excluded: { worker: T; reasons: ExclusionReason[] }[]; nextBatch: T[] }

/**
 * alreadyOffered = every worker with ANY booking_request for this booking (any status,
 * incl. rejected/timed_out/not_delivered). They are never re-selected, so rounds move
 * 1-5, 6-10, 11-15. assigned=true or cancelled=true -> no batch.
 */
export function selectNextBatch<T extends SimpleWorker>(
  workers: T[], opts: { community: string; service: string; slot: string; batchSize: number;
    alreadyOffered: Set<string>; assigned?: boolean; cancelled?: boolean; pastDeadline?: boolean },
): Selection<T> {
  const excluded: { worker: T; reasons: ExclusionReason[] }[] = [];
  const eligible: T[] = [];
  for (const w of workers) {
    const reasons = exclusionReasons(w, opts.community, opts.service, opts.slot);
    if (reasons.length) excluded.push({ worker: w, reasons }); else eligible.push(w);
  }
  const ordered = rankByRating(eligible);
  if (opts.assigned || opts.cancelled || opts.pastDeadline) return { ordered, excluded, nextBatch: [] };
  const nextBatch = ordered.filter((w) => !opts.alreadyOffered.has(w.id)).slice(0, Math.max(0, opts.batchSize));
  return { ordered, excluded, nextBatch };
}
