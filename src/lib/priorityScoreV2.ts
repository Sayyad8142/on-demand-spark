/**
 * Priority Score V2 — display-only reader of Admin's `get_my_priority_score` (contract_version 1).
 * The Admin Panel is the only scoring authority: every score, maximum, period, threshold,
 * penalty and expiry is copied from the server. Nothing here calculates, sums or deducts points.
 * Unknown or malformed responses return null so the existing live score keeps showing.
 */
export type V2ComponentKey = "completed_bookings" | "customer_ratings" | "booking_acceptance" | "start_otp_on_time";
export const V2_COMPONENT_ORDER: V2ComponentKey[] = ["completed_bookings", "customer_ratings", "booking_acceptance", "start_otp_on_time"];
export type V2ComponentState = "measured" | "neutral" | "new_worker";
export type V2Component = { key: V2ComponentKey; points: number | null; max_points: number; state: V2ComponentState; period_days: number | null; detail: string | null };
export type V2Penalty = { id: string; reason: string; points: number; created_at: string | null; expires_at: string | null; recovery: string | null };
export type V2Protection = { active: boolean; ends_at: string | null; detail: string | null };
export type PriorityScoreV2 = {
  status: "inactive" | "preview" | "active";
  live_score: number | null;
  v2_score: number | null;
  max_score: number;
  weighted_dispatch_active: boolean;
  components: V2Component[];
  penalties: V2Penalty[];
  new_worker_protection: V2Protection | null;
  server_now: string;
  updated_at: string | null;
};

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const date = (v: unknown): string | null => (typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : null);
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export function parsePriorityScoreV2(input: unknown): PriorityScoreV2 | null {
  if (!input || typeof input !== "object") return null;
  const r = input as Record<string, unknown>;
  if (r.contract_version !== 1) return null;
  if (r.status !== "inactive" && r.status !== "preview" && r.status !== "active") return null;
  const serverNow = date(r.server_now);
  if (!serverNow || !num(r.max_score) || r.max_score <= 0) return null;
  const v2 = r.v2_score === null || r.v2_score === undefined ? null : num(r.v2_score) ? r.v2_score : undefined;
  const live = r.live_score === null || r.live_score === undefined ? null : num(r.live_score) ? r.live_score : undefined;
  if (v2 === undefined || live === undefined) return null;
  // Active V2 must carry the server's official V2 score.
  if (r.status === "active" && v2 === null) return null;
  if (!Array.isArray(r.components)) return null;

  const components: V2Component[] = [];
  for (const c of r.components as unknown[]) {
    if (!c || typeof c !== "object") return null;
    const x = c as Record<string, unknown>;
    if (!V2_COMPONENT_ORDER.includes(x.key as V2ComponentKey)) continue; // future parts: ignore, don't invent
    if (!num(x.max_points) || x.max_points < 0) return null;
    const state = x.state === "neutral" || x.state === "new_worker" ? x.state : x.state === "measured" ? "measured" : null;
    if (!state) return null;
    const points = x.points === null || x.points === undefined ? null : num(x.points) ? x.points : undefined;
    if (points === undefined) return null;
    if (state === "measured" && points === null) return null;
    components.push({ key: x.key as V2ComponentKey, points, max_points: x.max_points, state,
      period_days: num(x.period_days) && x.period_days > 0 ? x.period_days : null, detail: text(x.detail) });
  }
  components.sort((a, b) => V2_COMPONENT_ORDER.indexOf(a.key) - V2_COMPONENT_ORDER.indexOf(b.key));

  const penalties: V2Penalty[] = [];
  if (r.penalties !== undefined && r.penalties !== null) {
    if (!Array.isArray(r.penalties)) return null;
    for (const p of r.penalties as unknown[]) {
      if (!p || typeof p !== "object") return null;
      const x = p as Record<string, unknown>;
      const id = text(x.id) ?? (num(x.id) ? String(x.id) : null);
      const reason = text(x.reason);
      if (!id || !reason || !num(x.points)) return null;
      penalties.push({ id, reason, points: Math.abs(x.points), created_at: date(x.created_at), expires_at: date(x.expires_at), recovery: text(x.recovery) });
    }
  }

  let protection: V2Protection | null = null;
  if (r.new_worker_protection && typeof r.new_worker_protection === "object") {
    const x = r.new_worker_protection as Record<string, unknown>;
    if (typeof x.active !== "boolean") return null;
    protection = { active: x.active, ends_at: date(x.ends_at), detail: text(x.detail) };
  }

  return {
    status: r.status, live_score: live, v2_score: v2, max_score: r.max_score,
    weighted_dispatch_active: r.weighted_dispatch_active === true,
    components, penalties, new_worker_protection: protection, server_now: serverNow, updated_at: date(r.updated_at),
  };
}

/** Penalties the server still lists as running at the server's own time (expired rows are hidden, never re-added). */
export function activePenalties(v: PriorityScoreV2): V2Penalty[] {
  const now = Date.parse(v.server_now);
  return v.penalties.filter(p => !p.expires_at || Date.parse(p.expires_at) > now);
}

export type HeadlineScore = { score: number | null; source: "v2" | "live"; showPreview: boolean };
/**
 * Which number is the worker's official score.
 * Only a server-confirmed active V2 replaces the existing live score; a preview never does.
 */
export function headlineScore(existingLive: number | null, v: PriorityScoreV2 | null): HeadlineScore {
  if (v && v.status === "active" && v.v2_score !== null) return { score: v.v2_score, source: "v2", showPreview: false };
  return { score: existingLive, source: "live", showPreview: !!v && v.status === "preview" && v.components.length > 0 };
}

/** Text for one component row; neutral OTP → "Not measured yet", unrated → "New Worker". Never a fake rating. */
export function componentValue(c: V2Component): { kind: "points" | "not_measured" | "new_worker"; points?: number; max: number } {
  if (c.state === "new_worker") return { kind: "new_worker", max: c.max_points };
  if (c.state === "neutral" || c.points === null) return { kind: "not_measured", max: c.max_points };
  return { kind: "points", points: c.points, max: c.max_points };
}
