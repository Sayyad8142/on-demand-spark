// DRAFT ONLY - approved Phase 2 formula, pure and deterministic. Not imported by the app.
export const BASE = 25, MIN = 0, MAX = 100, WINDOW_DAYS = 30;
export const PENALTY: Record<string, number> = {
  worker_no_show: 20, no_movement: 15, worker_cancelled: 10, complaint_verified: 10,
};
// Phase 4: no_movement disabled until detection is reliable; worker_refused / worker_late = 0.
export const ENABLED = new Set(["worker_no_show", "worker_cancelled", "complaint_verified"]);
export type Fault = { booking_id: string | null; event_id: string; reason_code: string; at: string; verified: boolean };
export type Input = { asOf: string; completedAt: string[]; faults: Fault[]; rating: number | null; validRatings: number };

const DAY = 86_400_000;
const inWindow = (at: string, asOf: string) => {
  const t = Date.parse(at), now = Date.parse(asOf);
  return t > now - WINDOW_DAYS * DAY && t <= now; // (asOf-30d, asOf]
};

export function score(i: Input) {
  const completed = i.completedAt.filter((a) => inWindow(a, i.asOf)).length;
  const seen = new Set<string>(); let penalty = 0;
  for (const f of i.faults) {
    const p = PENALTY[f.reason_code]; if (!p || !ENABLED.has(f.reason_code) || !f.verified || !inWindow(f.at, i.asOf)) continue;
    const key = (f.booking_id ?? `event:${f.event_id}`) + "|" + f.reason_code; // one per incident
    if (seen.has(key)) continue; seen.add(key); penalty += p;
  }
  const bonus = (i.rating ?? 0) >= 4.8 && i.validRatings >= 5 ? 5 : 0; // state, not event: never stacks
  const raw = BASE + completed + bonus - penalty;
  return { score: Math.max(MIN, Math.min(MAX, raw)), completed, bonus, penalty, raw };
}

// Dispatch tie-break among already-eligible workers (unchanged order).
export type Ranked = { id: string; score: number; rating: number | null; lastOfferAt: string | null };
export const rank = (ws: Ranked[]) => [...ws].sort((a, b) =>
  b.score - a.score || (b.rating ?? 0) - (a.rating ?? 0) ||
  (a.lastOfferAt ? Date.parse(a.lastOfferAt) : 0) - (b.lastOfferAt ? Date.parse(b.lastOfferAt) : 0) ||
  a.id.localeCompare(b.id));
