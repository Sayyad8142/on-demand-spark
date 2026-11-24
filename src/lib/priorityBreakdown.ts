// Display-only reader of the server's stored `workers.score_reason`.
// Never calculates a score: shows only the parts the server saved with the current score.
export interface PriorityPart { key: "completed" | "online" | "rating" | "recent" | "topRating" | "connection" | "penalties" | "lateStartOtp"; points: number }
export interface PriorityBreakdown { parts: PriorityPart[]; final: number }
const KEYS: PriorityPart["key"][] = ["completed", "online", "rating", "recent", "topRating", "connection", "penalties"];

export function parsePriorityBreakdown(reason: unknown, storedScore: unknown): PriorityBreakdown | null {
  if (typeof reason !== "string" || typeof storedScore !== "number" || !Number.isFinite(storedScore)) return null;
  const extended = /pts\(c\/o\/r\/rec\/b\/reach\/pen\/late\)=(-?[\d.]+)\/(-?[\d.]+)\/(-?[\d.]+)\/(-?[\d.]+)\/(-?[\d.]+)\/(-?[\d.]+)\/(-?[\d.]+)\/(-?[\d.]+)/.exec(reason);
  const pts = extended ?? /pts\(c\/o\/r\/rec\/b\/reach\/pen\)=(-?[\d.]+)\/(-?[\d.]+)\/(-?[\d.]+)\/(-?[\d.]+)\/(-?[\d.]+)\/(-?[\d.]+)\/(-?[\d.]+)/.exec(reason);
  const fin = /final=(-?[\d.]+)/.exec(reason);
  if (!pts || !fin) return null;
  const values = pts.slice(1).map(Number);
  const final = Number(fin[1]);
  if (values.some(v => !Number.isFinite(v)) || !Number.isFinite(final)) return null;
  // Only show a breakdown that belongs to the score actually stored.
  if (Math.abs(final - storedScore) > 0.05) return null;
  const keys: PriorityPart["key"][] = extended ? [...KEYS, "lateStartOtp"] : KEYS;
  const parts = keys.map((key, i) => ({ key, points: key === "penalties" || key === "lateStartOtp" ? -Math.abs(values[i]) : values[i] }));
  return { parts, final };
}
