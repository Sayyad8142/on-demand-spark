/**
 * Priority Score V2 — display-only reader of Admin's `get_my_priority_score` (contract_version 2).
 * The Admin Panel is the only scoring authority: every score, weight, deduction, protection value
 * and expiry is copied from the server. Nothing here calculates, sums or deducts points.
 * Unknown or malformed responses return null so the existing official score keeps showing.
 */
export type V2ComponentKey = "completed_bookings" | "customer_ratings" | "booking_acceptance" | "start_otp_on_time";
export const V2_COMPONENT_ORDER: V2ComponentKey[] = ["completed_bookings", "customer_ratings", "booking_acceptance", "start_otp_on_time"];
export type V2ComponentState = "measured" | "neutral" | "new_worker";
export type V2Component = { key: V2ComponentKey; points: number | null; max_points: number; state: V2ComponentState; period_days: number | null; detail: string | null };
export type V2Penalty = { id: string; reason: string; points: number; created_at: string | null; expires_at: string | null; recovery: string | null };
export type V2Protection = { active: boolean; ends_at: string | null; detail: string | null };
export type V2RatingDisplay = { kind: "new_worker" } | { kind: "rating"; average: number; count: number } | null;
export type PriorityScoreV2 = {
  status: "preview" | "active";
  v2_active: boolean;
  /** performance_score — the main V2 number. */
  v2_score: number | null;
  raw_score: number | null;
  penalty_deductions: number | null;
  protection_adjustment: number | null;
  protected_dispatch_score: number | null;
  max_score: number;
  weighted_dispatch_active: boolean;
  components: V2Component[];
  penalties: V2Penalty[];
  new_worker_protection: V2Protection | null;
  rating_display: V2RatingDisplay;
  config_version: string | null;
  server_now: string | null;
  updated_at: string | null;
};

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const date = (v: unknown): string | null => (typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : null);
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
/** Live Admin keys (completed/rating/acceptance/otp) → display keys. */
const KEY_ALIAS: Record<string, V2ComponentKey> = { completed: "completed_bookings", rating: "customer_ratings", acceptance: "booking_acceptance", otp: "start_otp_on_time" };
const canonical = (k: unknown): V2ComponentKey | null => typeof k !== "string" ? null : V2_COMPONENT_ORDER.includes(k as V2ComponentKey) ? (k as V2ComponentKey) : KEY_ALIAS[k] ?? null;
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
/** null/undefined → null, finite number → number, anything else → undefined (malformed). */
const optNum = (v: unknown): number | null | undefined => (v === null || v === undefined ? null : num(v) ? v : undefined);

function parseRatingDisplay(v: unknown): V2RatingDisplay | undefined {
  if (v === null || v === undefined) return null;
  if (v === "new_worker" || v === "New Worker") return { kind: "new_worker" };
  if (typeof v === "string") { const n = Number(v); return Number.isFinite(n) && v.trim() !== "" ? { kind: "rating", average: n, count: 0 } : undefined; }
  if (!obj(v)) return undefined;
  if (v.kind === "new_worker" || v.state === "new_worker" || v.new_worker === true) return { kind: "new_worker" };
  const avg = v.average ?? v.value, count = v.count;
  if (num(avg) && num(count) && count > 0) return { kind: "rating", average: avg, count };
  if (num(count) && count === 0) return { kind: "new_worker" };
  return undefined;
}

export function parsePriorityScoreV2(input: unknown): PriorityScoreV2 | null {
  if (!obj(input)) return null;
  const r = input;
  if (r.contract_version !== 2) return null;
  if (typeof r.v2_active !== "boolean") return null;
  const perf = optNum(r.performance_score), raw = optNum(r.raw_score), ded = optNum(r.penalty_deductions);
  const adj = optNum(r.protection_adjustment), pds = optNum(r.protected_dispatch_score);
  if (perf === undefined || raw === undefined || ded === undefined || adj === undefined || pds === undefined) return null;
  // Active V2 must carry the server's official performance score.
  if (r.v2_active && perf === null) return null;
  const weights = obj(r.weights) ? r.weights : {};

  // Components may arrive as an array of rows or an object keyed by component name.
  let rows: Record<string, unknown>[] = [];
  if (Array.isArray(r.components)) {
    if (!r.components.every(obj)) return null;
    rows = r.components as Record<string, unknown>[];
  } else if (obj(r.components)) {
    rows = Object.entries(r.components).map(([key, val]) => (obj(val) ? { key, ...val } : num(val) || val === null ? { key, points: val } : { key, invalid: true }));
  } else return null;

  const components: V2Component[] = [];
  for (const x of rows) {
    if (x.invalid) return null;
    const key = canonical(x.key);
    if (!key) continue; // future parts: ignore, don't invent
    const short = Object.keys(KEY_ALIAS).find(k => KEY_ALIAS[k] === key)!;
    const max = num(x.max_points) ? x.max_points : num(x.max) ? x.max : num(weights[key]) ? (weights[key] as number) : num(weights[short]) ? (weights[short] as number) : null;
    if (max === null || max < 0) return null;
    const points = optNum(x.points ?? x.score);
    if (points === undefined) return null;
    const state: V2ComponentState | null = x.state === "neutral" || x.state === "new_worker" || x.state === "measured" ? x.state
      : x.state !== undefined ? null
      : key === "start_otp_on_time" && x.neutral === true ? "neutral"
      : key === "customer_ratings" && r.is_new_worker === true ? "new_worker"
      : points === null ? "neutral" : "measured";
    if (!state || (state === "measured" && points === null)) return null;
    components.push({ key, points, max_points: max, state, period_days: num(x.period_days) && x.period_days > 0 ? x.period_days : null, detail: text(x.detail) });
  }
  components.sort((a, b) => V2_COMPONENT_ORDER.indexOf(a.key) - V2_COMPONENT_ORDER.indexOf(b.key));

  const penalties: V2Penalty[] = [];
  if (r.penalties !== undefined && r.penalties !== null) {
    if (!Array.isArray(r.penalties)) return null;
    for (const p of r.penalties as unknown[]) {
      if (!obj(p)) return null;
      const id = text(p.id) ?? (num(p.id) ? String(p.id) : null);
      const reason = text(p.reason) ?? text(p.type);
      if (!id || !reason || !num(p.points)) return null;
      if (p.reversed === true || p.active === false) continue; // server says not running: never shown as active
      penalties.push({ id, reason, points: Math.abs(p.points), created_at: date(p.created_at),
        expires_at: date(p.expires_at) ?? date(p.recovers_at), recovery: text(p.recovery) });
    }
  }

  const endsAt = date(r.protection_ends_at);
  const protectedFlag = typeof r.new_worker_protected === "boolean" ? r.new_worker_protected : !!endsAt || (adj !== null && adj !== 0);
  const protection: V2Protection | null = protectedFlag ? { active: true, ends_at: endsAt, detail: null } : null;
  const rating = parseRatingDisplay(r.rating_display);
  if (rating === undefined) return null;

  return {
    status: r.v2_active ? "active" : "preview", v2_active: r.v2_active,
    v2_score: perf, raw_score: raw, penalty_deductions: ded === null ? null : Math.abs(ded),
    protection_adjustment: adj, protected_dispatch_score: pds,
    max_score: num(r.max_score) && r.max_score > 0 ? r.max_score : 100,
    weighted_dispatch_active: r.v2_active,
    components, penalties, new_worker_protection: protection, rating_display: rating,
    config_version: text(r.config_version) ?? (num(r.config_version) ? String(r.config_version) : null),
    server_now: date(r.server_now) ?? date(r.computed_at), updated_at: date(r.updated_at) ?? date(r.computed_at),
  };
}

/** Penalties the server still lists as running at the server's own time (expired rows are hidden, never re-added). */
export function activePenalties(v: PriorityScoreV2, deviceNow = Date.now()): V2Penalty[] {
  const now = v.server_now ? Date.parse(v.server_now) : deviceNow;
  return v.penalties.filter(p => !p.expires_at || Date.parse(p.expires_at) > now);
}

export type HeadlineScore = { score: number | null; source: "v2" | "live"; showPreview: boolean };
/**
 * Which number is the worker's official score.
 * Only server-confirmed `v2_active` replaces the existing official score; a preview never does.
 */
export function headlineScore(existingLive: number | null, v: PriorityScoreV2 | null): HeadlineScore {
  if (v && v.v2_active && v.v2_score !== null) return { score: v.v2_score, source: "v2", showPreview: false };
  return { score: existingLive, source: "live", showPreview: !!v && !v.v2_active && (v.components.length > 0 || v.v2_score !== null) };
}

/** Text for one component row; neutral OTP → "Not measured yet", unrated → "New Worker". Never a fake rating. */
export function componentValue(c: V2Component): { kind: "points" | "not_measured" | "new_worker"; points?: number; max: number } {
  if (c.state === "new_worker") return { kind: "new_worker", max: c.max_points };
  if (c.state === "neutral" || c.points === null) return { kind: "not_measured", max: c.max_points };
  return { kind: "points", points: c.points, max: c.max_points };
}
