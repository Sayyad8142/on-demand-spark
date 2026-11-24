/** Read-only proposed server contract. No deadline or score is calculated here. */
export const LATE_START_PRIORITY_ENABLED = false;
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