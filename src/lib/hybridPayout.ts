/**
 * Hybrid payout display types — PLACEHOLDER SHAPES ONLY.
 *
 * View shapes the cards render. Filled from WORKER_APP_API_CONTRACT.md v1
 * by src/lib/hybridPayoutApi.ts. Nothing
 * here reads production data; the components render only the props given.
 * Replace these with the real contract fields when it arrives.
 */

/** Keep OFF until the verified Admin Panel contract is integrated. */
export const HYBRID_PAYOUT_UI_ENABLED = false;

export interface InstantProgressView {
  slotsTotal: number;      // e.g. 10, supplied by server
  slotsAllocated: number;  // supplied by server
  slotsSettled: number;    // confirmed paid, supplied by server
}

export interface DailyScheduleView {
  /** Next payout time as an ISO instant, supplied by server. */
  nextPayoutAt: string | null;
  /** Whether automatic bank transfer is currently active, supplied by server. */
  transfersActive: boolean;
}

export interface ConsolidatedPayoutView {
  id: string;
  kind: "instant" | "daily";
  amount: number;
  status: string;            // raw server status
  statusLabel?: string;      // server label (contract v1); shown verbatim when present
  bookingCount?: number;     // server count; bookings list loads on demand
  paidAt: string | null;
  reference: string | null;
  failureReason: string | null;
  bookings: { bookingId: string; amount: number }[];
}

export interface ManualPayoutView {
  amount: number;
  paidAt: string;
  reference: string | null;
  verified: boolean;          // server says admin verified it
}

/** Clamp server counts so a bad value can never show more than the total. */
export function normalizeInstantProgress(v: InstantProgressView): InstantProgressView {
  const total = Math.max(0, Math.floor(Number(v.slotsTotal) || 0));
  const allocated = Math.min(total, Math.max(0, Math.floor(Number(v.slotsAllocated) || 0)));
  const settled = Math.min(allocated, Math.max(0, Math.floor(Number(v.slotsSettled) || 0)));
  return { slotsTotal: total, slotsAllocated: allocated, slotsSettled: settled };
}

export function instantSlotsExhausted(v: InstantProgressView): boolean {
  const n = normalizeInstantProgress(v);
  return n.slotsTotal > 0 && n.slotsAllocated >= n.slotsTotal;
}

/** Sum of included bookings — used to flag a mismatch with the payout amount. */
export function consolidatedMatches(p: ConsolidatedPayoutView): boolean {
  const sum = p.bookings.reduce((s, b) => s + (Number(b.amount) || 0), 0);
  return p.bookings.length === 0 || sum === p.amount;
}
