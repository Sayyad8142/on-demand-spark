// Worker ranking for dispatch (2026-10-21, quality + connectivity).
// Ordering only — never used as an eligibility filter.
//   1. Connection group: <=10m, <=30m, <=2h, <=24h, older/never (fresher first)
//   2. Reliable rating (Bayesian-shrunk by review count). Unrated workers are
//      NOT given 5 stars: they rank after rated workers inside the same group,
//      but stay eligible and ahead of any older connection group.
//   3. Connection recency (most recent first)
//   4. priority_score DESC, then last_offer_at ASC (fair round-robin)
// Delivery ACKs are deliberately NOT used: older Worker App versions do not send them.

export interface RankableWorker {
  rating?: number | null;
  admin_override_rating?: number | null;
  total_ratings?: number | null;
  last_heartbeat_at?: string | null;
  last_app_opened_at?: string | null;
  priority_score?: number | null;
  last_offer_at?: string | null;
}

export const CONNECTION_GROUP_LIMITS_MIN = [10, 30, 120, 24 * 60]; // group 4 = older/never
export const RATING_PRIOR_MEAN = 4.0;   // neutral prior used only to shrink low-count ratings
export const RATING_PRIOR_WEIGHT = 5;   // reviews needed before a rating is trusted at face value

export function lastConnectedMs(w: RankableWorker): number | null {
  const ts = [w.last_heartbeat_at, w.last_app_opened_at]
    .map((t) => (t ? new Date(t).getTime() : NaN))
    .filter((n) => Number.isFinite(n));
  return ts.length ? Math.max(...ts) : null;
}

export function connectionGroup(w: RankableWorker, nowMs: number): number {
  const last = lastConnectedMs(w);
  if (last === null) return CONNECTION_GROUP_LIMITS_MIN.length;
  const ageMin = (nowMs - last) / 60000;
  const i = CONNECTION_GROUP_LIMITS_MIN.findIndex((lim) => ageMin <= lim);
  return i === -1 ? CONNECTION_GROUP_LIMITS_MIN.length : i;
}

/** Reliable rating, or null when the worker has no rating data. */
export function reliableRating(w: RankableWorker): number | null {
  if (w.admin_override_rating != null) return Number(w.admin_override_rating);
  if (w.rating == null) return null;
  const n = Math.max(0, Number(w.total_ratings ?? 0));
  if (n === 0) return null; // a rating with zero reviews is not real data
  const r = Number(w.rating);
  return (r * n + RATING_PRIOR_MEAN * RATING_PRIOR_WEIGHT) / (n + RATING_PRIOR_WEIGHT);
}

// TEMPORARY LAUNCH MODE (2026-11-05), switch ops_settings dispatch.uniform_ranking.
// When on: every eligible worker has effective rating 4.3 and priority 50
// (in memory only, never written), connection recency is NOT used for ordering,
// and workers are ranked purely by longest time since last offer.
export const UNIFORM_RATING = 4.3;
export const UNIFORM_PRIORITY = 50;
export interface RankOptions { uniform?: boolean }
export function effectiveRating(w: RankableWorker, o: RankOptions = {}): number | null {
  return o.uniform ? UNIFORM_RATING : reliableRating(w);
}
export function effectivePriority(w: RankableWorker, o: RankOptions = {}): number {
  return o.uniform ? UNIFORM_PRIORITY : Number(w.priority_score ?? 0);
}
function offerAgeCompare(a: RankableWorker, b: RankableWorker): number {
  const oa = a.last_offer_at ? new Date(a.last_offer_at).getTime() : 0;
  const ob = b.last_offer_at ? new Date(b.last_offer_at).getTime() : 0;
  return oa - ob;
}

export function compareWorkers(a: RankableWorker, b: RankableWorker, nowMs: number, o: RankOptions = {}): number {
  if (o.uniform) return offerAgeCompare(a, b);
  const ga = connectionGroup(a, nowMs), gb = connectionGroup(b, nowMs);
  if (ga !== gb) return ga - gb;

  const ra = reliableRating(a), rb = reliableRating(b);
  if (ra === null && rb !== null) return 1;
  if (rb === null && ra !== null) return -1;
  if (ra !== null && rb !== null) {
    const d = Math.round(rb * 100) - Math.round(ra * 100);
    if (d !== 0) return d;
  }

  const la = lastConnectedMs(a) ?? 0, lb = lastConnectedMs(b) ?? 0;
  if (la !== lb) return lb - la;

  const pa = Number(a.priority_score ?? 0), pb = Number(b.priority_score ?? 0);
  if (pa !== pb) return pb - pa;

  const oa = a.last_offer_at ? new Date(a.last_offer_at).getTime() : 0;
  const ob = b.last_offer_at ? new Date(b.last_offer_at).getTime() : 0;
  return oa - ob;
}

export function rankWorkers<T extends RankableWorker>(workers: T[], nowMs: number, o: RankOptions = {}): T[] {
  return [...workers].sort((a, b) => compareWorkers(a, b, nowMs, o));
}
