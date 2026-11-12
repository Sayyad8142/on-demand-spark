// Display only. Activation requires separately approved and verified backend deployment.
export const NEXT_BOOKING_LIVE_ENABLED = false;
export type NextReason = "available" | "off" | "busy" | "no_slot" | "inactive" | "unable";
export interface NextRow { rank: number; name: string; priority: number; rating: number; isMe: boolean }
export interface NextSnapshot {
  version: 1; updatedAt: string; slotStart: string; slotEnd: string;
  community: string; service: string; communities: string[]; services: string[];
  reason: NextReason; rows: NextRow[];
}
export function indiaSlot(now: number) {
  const shifted = new Date(now + 330 * 60_000);
  const start = Math.floor(now / 1_800_000) * 1_800_000;
  return { start, end: start + 1_800_000, day: shifted.getUTCDay(),
    key: `${String(shifted.getUTCHours()).padStart(2, "0")}:${shifted.getUTCMinutes() < 30 ? "00" : "30"}:00` };
}
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).every(k => keys.includes(k)) && keys.every(k => k in v);
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 100 && v.every(s => typeof s === "string" && s.length > 0 && s.length <= 100);
// Reject unknown fields (including phone/token/id) rather than retaining them in state.
export function parseNextSnapshot(input: unknown, now = Date.now()): NextSnapshot {
  if (!record(input) || !exact(input, ["version", "updatedAt", "slotStart", "slotEnd", "community", "service", "communities", "services", "reason", "rows"])) throw Error("invalid_contract");
  const { version, updatedAt, slotStart, slotEnd, community, service, communities, services, reason, rows } = input;
  if (version !== 1 || typeof updatedAt !== "string" || typeof slotStart !== "string" || typeof slotEnd !== "string" ||
      typeof community !== "string" || typeof service !== "string" || !strings(communities) || !strings(services) ||
      !communities.includes(community) || !services.includes(service) || !["maid", "bathroom_cleaning"].includes(service) ||
      !["available", "off", "busy", "no_slot", "inactive", "unable"].includes(String(reason)) || !Array.isArray(rows) || rows.length > 10000) throw Error("invalid_contract");
  const slot = indiaSlot(now), timestamp = Date.parse(updatedAt);
  if (!Number.isFinite(timestamp) || now - timestamp > 20_000 || timestamp > now + 5_000 ||
      Date.parse(slotStart) !== slot.start || Date.parse(slotEnd) !== slot.end) throw Error("stale_contract");
  const safeRows: NextRow[] = rows.map((row, index) => {
    if (!record(row) || !exact(row, ["rank", "name", "priority", "rating", "isMe"]) || row.rank !== index + 1 ||
        typeof row.name !== "string" || row.name.length === 0 || row.name.length > 80 ||
        typeof row.priority !== "number" || !Number.isFinite(row.priority) ||
        typeof row.rating !== "number" || !Number.isFinite(row.rating) || row.rating < 0 || row.rating > 5 || typeof row.isMe !== "boolean") throw Error("invalid_row");
    return { rank: row.rank as number, name: row.name, priority: row.priority, rating: row.rating, isMe: row.isMe };
  });
  if (safeRows.filter(r => r.isMe).length > 1 || (reason === "available") !== safeRows.some(r => r.isMe) ||
      safeRows.some((r, i) => i > 0 && (safeRows[i - 1].priority < r.priority || (safeRows[i - 1].priority === r.priority && safeRows[i - 1].rating < r.rating)))) throw Error("invalid_order");
  return { version: 1, updatedAt, slotStart, slotEnd, community, service, communities, services, reason: reason as NextReason, rows: safeRows };
}