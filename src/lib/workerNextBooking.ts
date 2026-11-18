// Display-only reader for the existing `worker-next-booking` response. Never computes or invents a position.
export interface NextArea {
  community: string; service: string; status: string; reason: string | null;
  groupsAhead: number | null; boundaryTie: boolean; starvationGuard: boolean;
}
export interface WorkerNextBooking { snapshotAt: string; estimateOnly: boolean; rankingMode: string | null; areas: NextArea[] }
const CODE = /^[a-z0-9][a-z0-9_-]{0,79}$/i;
const code = (v: unknown) => typeof v === "string" && CODE.test(v);
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
// Only known fields are copied; anything else in the response is dropped.
export function parseWorkerNextBooking(input: unknown, now = Date.now()): WorkerNextBooking {
  if (!record(input) || input.ok !== true || typeof input.estimate_only !== "boolean" || !Array.isArray(input.areas) || input.areas.length > 50) throw Error("invalid_contract");
  const snapshotAt = input.snapshot_at;
  if (typeof snapshotAt !== "string" || !Number.isFinite(Date.parse(snapshotAt))) throw Error("invalid_contract");
  const timestamp = Date.parse(snapshotAt);
  if (now - timestamp > 20_000 || timestamp > now + 5_000) throw Error("stale_contract");
  const rankingMode = input.ranking_mode == null ? null : code(input.ranking_mode) ? String(input.ranking_mode) : null;
  const areas = input.areas.map((a): NextArea => {
    if (!record(a) || !code(a.community) || !code(a.service) || !["maid", "bathroom_cleaning"].includes(String(a.service)) || !code(a.status)) throw Error("invalid_area");
    const g = a.groups_ahead;
    if (g !== null && g !== undefined && !(typeof g === "number" && Number.isInteger(g) && g >= 0 && g < 100000)) throw Error("invalid_area");
    return { community: a.community as string, service: a.service as string, status: a.status as string,
      reason: code(a.reason) ? a.reason as string : null, groupsAhead: typeof g === "number" ? g : null,
      boundaryTie: a.boundary_tie === true, starvationGuard: a.starvation_guard === true };
  });
  return { snapshotAt, estimateOnly: input.estimate_only, rankingMode, areas };
}
export type AreaPosition = { kind: "next" } | { kind: "line"; ahead: number } | { kind: "none" };
// Next Group / In Line only from a server-supplied groups_ahead.
export function areaPosition(area: NextArea): AreaPosition {
  if (area.groupsAhead === null) return { kind: "none" };
  return area.groupsAhead === 0 ? { kind: "next" } : { kind: "line", ahead: area.groupsAhead };
}
export const prettyCode = (v: string) => v.replace(/[-_]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
