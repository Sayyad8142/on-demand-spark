/** Read-only proposed server contract. No deadline or score is calculated here. */
export const LATE_START_PRIORITY_ENABLED = true;
export type LateStartPriority = {
  settings: { enabled: boolean; points: number };
  penalty: { booking_id: string; points: number; confirmed_at: string } | null;
};
export function parseLateStartPriority(input: unknown, bookingId: string): LateStartPriority | null {
  if (!input || typeof input !== "object") return null;
  const row = input as Record<string, unknown>;
  if (row.contract_version !== 1 || !row.settings || typeof row.settings !== "object") return null;
  const settings = row.settings as Record<string, unknown>;
  if (typeof settings.enabled !== "boolean" || typeof settings.points !== "number" || !Number.isFinite(settings.points) || settings.points < 0) return null;
  let penalty: LateStartPriority["penalty"] = null;
  if (row.penalty !== null) {
    if (!row.penalty || typeof row.penalty !== "object") return null;
    const p = row.penalty as Record<string, unknown>;
    if (p.booking_id !== bookingId || typeof p.points !== "number" || !Number.isFinite(p.points) || p.points <= 0 || typeof p.confirmed_at !== "string" || !Number.isFinite(Date.parse(p.confirmed_at))) return null;
    penalty = { booking_id: bookingId, points: p.points, confirmed_at: p.confirmed_at };
  }
  return { settings: { enabled: settings.enabled, points: settings.points }, penalty };
}

export function lateStartNotice(data: LateStartPriority | null | undefined, overdue: boolean): { kind: "warning" | "confirmed"; points: number } | null {
  if (!data) return null;
  if (overdue && data.penalty) return { kind: "confirmed", points: data.penalty.points };
  if (!overdue && !data.penalty && data.settings.enabled && data.settings.points > 0) return { kind: "warning", points: data.settings.points };
  return null;
}
/**
 * Reader for Admin's live `get_my_late_start_status` (contract_version 1).
 * Deadline, points and "enabled" are taken only from the server; no deduction is calculated here.
 * Returns null when the response is malformed or does not contain this booking.
 */
export type LateStartStatus = LateStartPriority & { deadline_at: string | null; deadline_minutes: number; deadline_rule_version: number | null; unmeasurable: boolean };
export function parseLateStartStatus(input: unknown, bookingId: string): LateStartStatus | null {
  if (!input || typeof input !== "object") return null;
  const r = input as Record<string, unknown>;
  if ((r.contract_version !== 1 && r.contract_version !== 2) || !r.settings || typeof r.settings !== "object" || !Array.isArray(r.bookings)) return null;
  const s = r.settings as Record<string, unknown>;
  if (typeof s.enabled !== "boolean") return null;
  const b = (r.bookings as unknown[]).find((x): x is Record<string, unknown> => !!x && typeof x === "object" && (x as Record<string, unknown>).booking_id === bookingId);
  if (!b) return null;
  const minutes = b.deadline_minutes, points = b.deduction_points;
  const basis = typeof b.deadline_basis === "string" ? b.deadline_basis : "";
  // Server says it cannot measure (e.g. scheduled booking without a start time): no countdown, alarm or warning.
  const unmeasurable = b.deadline_at === null || basis.startsWith("unmeasurable");
  if (!unmeasurable && (typeof b.deadline_at !== "string" || !Number.isFinite(Date.parse(b.deadline_at)))) return null;
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) return null;
  if (typeof points !== "number" || !Number.isFinite(points) || points < 0) return null;
  const enabled = !unmeasurable && s.enabled === true && b.penalty_enabled === true && b.exempted !== true;
  let penalty: LateStartPriority["penalty"] = null;
  if (Array.isArray(r.history)) {
    const h = (r.history as unknown[]).find((x): x is Record<string, unknown> => {
      if (!x || typeof x !== "object") return false;
      const e = x as Record<string, unknown>;
      return e.booking_id === bookingId && typeof e.points_change === "number" && e.points_change < 0 && e.reversed !== true
        && typeof e.created_at === "string" && Number.isFinite(Date.parse(e.created_at));
    });
    if (h) penalty = { booking_id: bookingId, points: Math.abs(h.points_change as number), confirmed_at: h.created_at as string };
  }
  const rv = b.deadline_rule_version ?? r.deadline_rule_version;
  const ruleVersion = typeof rv === "number" && Number.isInteger(rv) && rv > 0 ? rv : null;
  return { settings: { enabled, points }, penalty, deadline_at: unmeasurable ? null : (b.deadline_at as string), deadline_minutes: minutes, deadline_rule_version: ruleVersion, unmeasurable };
}
