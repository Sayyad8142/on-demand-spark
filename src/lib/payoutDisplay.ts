/**
 * Display-only payout rules shared by Earnings, Profile, Bookings and the
 * completion receipt. Reads server values only; never decides, creates or
 * changes a payout.
 */

export type PayoutDisplayState =
  | "earned"      // booking completed, no payout record yet (estimate)
  | "awaiting"    // payout recorded, not yet sent (created/pending/approved/unknown)
  | "processing"  // sent to the bank, not yet confirmed
  | "paid"        // server status paid AND paid_at present
  | "on_hold"
  | "failed"
  | "reversed";

export interface PayoutRecord {
  id: string;
  booking_id: string;
  gross_amount: number | null;
  platform_fee: number | null;
  payout_amount: number | null;
  status: string | null;
  payout_method: string | null;
  payout_source: string | null;
  failure_reason: string | null;
  paid_at: string | null;
  created_at: string;
  external_reference: string | null;
  reference_id: string | null;
  manual_utr: string | null;
}

/** Explicit column list — never select("*") for money screens. */
export const PAYOUT_COLUMNS =
  "id, booking_id, gross_amount, platform_fee, payout_amount, status, payout_method, payout_source, failure_reason, paid_at, created_at, external_reference, reference_id, manual_utr";

/** Map a raw server status to what the worker sees. Paid needs server confirmation (paid_at). */
export function mapPayoutStatus(status: string | null | undefined, paidAt?: string | null): PayoutDisplayState {
  const s = (status ?? "").trim().toLowerCase();
  switch (s) {
    case "paid":
    case "success":
    case "completed":
    case "credited":
      return paidAt ? "paid" : "processing";
    case "processing":
    case "initiated":
    case "sent":
      return "processing";
    case "held":
    case "on_hold":
    case "frozen":
      return "on_hold";
    case "failed":
    case "rejected":
      return "failed";
    case "reversed":
      return "reversed";
    case "estimating":
    case "earned":
      return "earned";
    default:
      // created, pending, approved, queued and anything unknown: never "paid".
      return "awaiting";
  }
}

/** States whose money the worker is still expected to receive (or has received). */
export function countsAsEarned(state: PayoutDisplayState): boolean {
  return state !== "failed" && state !== "reversed";
}

/** Reference shown to the worker — only for confirmed paid payouts. */
export function payoutReference(p: Pick<PayoutRecord, "status" | "paid_at" | "manual_utr" | "reference_id" | "external_reference">): string | null {
  if (mapPayoutStatus(p.status, p.paid_at) !== "paid") return null;
  const ref = p.manual_utr || p.reference_id || p.external_reference;
  return ref && ref.trim() ? ref.trim() : null;
}

export function isManualPayout(p: Pick<PayoutRecord, "payout_source" | "manual_utr">): boolean {
  return (p.payout_source ?? "").toLowerCase() === "manual" || !!p.manual_utr;
}

/* ---------------- Asia/Kolkata date boundaries ---------------- */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** "YYYY-MM-DD" of the instant in India time, whatever the phone's timezone. */
export function istDayKey(d: Date | string | number): string {
  const t = new Date(d).getTime() + IST_OFFSET_MS;
  return new Date(t).toISOString().slice(0, 10);
}

export function istMonthKey(d: Date | string | number): string {
  return istDayKey(d).slice(0, 7);
}

/** UTC instant of 00:00 IST on the day containing `d`. */
export function istStartOfDay(d: Date | string | number): Date {
  const shifted = new Date(d).getTime() + IST_OFFSET_MS;
  return new Date(Math.floor(shifted / DAY_MS) * DAY_MS - IST_OFFSET_MS);
}

/** UTC instant of Monday 00:00 IST of the week containing `d`. */
export function istStartOfWeek(d: Date | string | number): Date {
  const start = istStartOfDay(d);
  const dow = new Date(start.getTime() + IST_OFFSET_MS).getUTCDay(); // 0=Sun
  const back = (dow + 6) % 7;
  return new Date(start.getTime() - back * DAY_MS);
}

/* ---------------- Totals ---------------- */

export interface PayoutTotals {
  today: number;      // earned today (IST), failed/reversed excluded
  week: number;       // earned this IST week (Mon–Sun)
  month: number;      // earned this IST month
  total: number;      // lifetime earned
  awaiting: number;
  processing: number;
  paid: number;       // confirmed paid only
  failed: number;     // failed + reversed
  onHold: number;
  earnedNotRecorded: number; // estimates (no payout record yet) — never in today/week/month/total
}

export interface TotalsInput {
  status: string | null;
  paid_at: string | null;
  payout_amount: number | null;
  created_at: string;
  isEstimate?: boolean;
}

export function computePayoutTotals(rows: TotalsInput[], now: Date = new Date()): PayoutTotals {
  const t: PayoutTotals = { today: 0, week: 0, month: 0, total: 0, awaiting: 0, processing: 0, paid: 0, failed: 0, onHold: 0, earnedNotRecorded: 0 };
  const todayKey = istDayKey(now);
  const monthKey = istMonthKey(now);
  const weekStart = istStartOfWeek(now).getTime();
  for (const r of rows) {
    const amt = Math.max(0, Number(r.payout_amount) || 0);
    const state = r.isEstimate ? "earned" : mapPayoutStatus(r.status, r.paid_at);
    switch (state) {
      case "paid": t.paid += amt; break;
      case "processing": t.processing += amt; break;
      case "awaiting": t.awaiting += amt; break;
      case "on_hold": t.onHold += amt; break;
      case "earned": t.earnedNotRecorded += amt; break;
      default: t.failed += amt;
    }
    // Only server payout records count toward totals, so every screen agrees.
    if (state === "earned" || !countsAsEarned(state)) continue;
    t.total += amt;
    const at = new Date(r.created_at);
    if (Number.isNaN(at.getTime())) continue;
    if (istDayKey(at) === todayKey) t.today += amt;
    if (istMonthKey(at) === monthKey) t.month += amt;
    if (at.getTime() >= weekStart) t.week += amt;
  }
  return t;
}

/** Worker-facing label (English source text; pass through displayText). */
export const PAYOUT_STATE_LABEL: Record<PayoutDisplayState, string> = {
  earned: "Earned",
  awaiting: "Awaiting payout",
  processing: "Processing",
  paid: "Paid",
  on_hold: "On hold",
  failed: "Failed",
  reversed: "Reversed",
};
