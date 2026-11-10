/**
 * Hybrid payout adapter — WORKER_APP_API_CONTRACT.md v1 (STAGED, not live).
 *
 * Calls only the four read-only RPCs with the signed-in session; never passes a
 * worker id, never writes payout tables, never calculates fees, modes or totals.
 * Every response is strictly validated: anything malformed throws a
 * HybridPayoutError so callers fall back to the existing payout screens.
 * Gated by HYBRID_PAYOUT_UI_ENABLED (off until verified against the deployed backend).
 */
import { supabase } from "@/integrations/supabase/client";
import {
  HYBRID_PAYOUT_UI_ENABLED,
  type InstantProgressView, type DailyScheduleView, type ConsolidatedPayoutView, type ManualPayoutView,
} from "@/lib/hybridPayout";
import type { PayoutDisplayState } from "@/lib/payoutDisplay";

export const EARNING_STATUSES = ["awaiting_payout", "prepared", "processing", "paid", "failed", "held", "reversed"] as const;
export type EarningStatus = (typeof EARNING_STATUSES)[number];
export type PayoutType = "instant" | "daily_batch" | "manual" | "legacy";
const PAYOUT_TYPES: PayoutType[] = ["instant", "daily_batch", "manual", "legacy"];

export type HybridErrorCode = "disabled" | "not_a_worker" | "invalid_cursor" | "not_found" | "malformed" | "network";
export class HybridPayoutError extends Error {
  constructor(public code: HybridErrorCode, message?: string) { super(message ?? code); this.name = "HybridPayoutError"; }
}

export interface PayoutSummary {
  payoutMode: "instant" | "daily";
  instantSlots: { limit: number; allocated: number; settled: number; remaining: number };
  today: { dateIst: string; earnedInr: number; bookings: number };
  totalsInr: { awaiting_payout: number; prepared: number; processing: number; paid: number; failed: number; held: number };
  nextSettlement: { batchDateIst: string; cutoffAt: string; label: string; estimatedAmountInr: number } | null;
  bankPayoutsActive: boolean;
  generatedAt: string;
}
export interface PayoutHistoryItem {
  payoutId: string; payoutType: PayoutType | string; status: string; statusLabel: string;
  amountInr: number; bookingCount: number; batchDateIst: string | null; reference: string | null;
  createdAt: string; paidAt: string | null; failureReason: string | null;
}
export interface PayoutDetailBooking {
  bookingId: string; completedAt: string; serviceEarningInr: number; tipInr: number;
  platformFeeInr: number; earningInr: number; payoutPath: string; instantSlotNo: number | null;
}
export interface PayoutDetail {
  payoutId: string; payoutType: PayoutType | string; status: string; statusLabel: string; amountInr: number;
  batchDateIst: string | null; cutoffAt: string | null; reference: string | null; paidAt: string | null; createdAt: string;
  failure: { reason: string; failedAt: string; nextStep: string } | null;
  bookings: PayoutDetailBooking[];
}
export interface EarningItem {
  earningId: string; bookingId: string; completedAt: string; earningInr: number; serviceEarningInr: number;
  tipInr: number; platformFeeInr: number; status: string; statusLabel: string; payoutPath: string;
  instantSlotNo: number | null; payoutId: string | null; expectedSettlementDateIst: string | null;
}
export interface Page<T> { items: T[]; nextCursor: string | null }

// ---------- strict field readers ----------
type Obj = Record<string, unknown>;
const bad = (f: string): never => { throw new HybridPayoutError("malformed", `bad field: ${f}`); };
const obj = (v: unknown, f: string): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : bad(f));
const str = (o: Obj, k: string): string => (typeof o[k] === "string" && (o[k] as string).length > 0 ? (o[k] as string) : bad(k));
const strOrNull = (o: Obj, k: string): string | null => (o[k] == null ? null : typeof o[k] === "string" ? (o[k] as string) : bad(k));
/** Integer rupees, never negative. */
const inr = (o: Obj, k: string): number => (Number.isInteger(o[k]) && (o[k] as number) >= 0 ? (o[k] as number) : bad(k));
const intOrNull = (o: Obj, k: string): number | null => (o[k] == null ? null : inr(o, k));
const iso = (o: Obj, k: string): string => { const s = str(o, k); return Number.isNaN(Date.parse(s)) ? bad(k) : s; };
const isoOrNull = (o: Obj, k: string): string | null => (o[k] == null ? null : iso(o, k));
const arr = (o: Obj, k: string): unknown[] => (Array.isArray(o[k]) ? (o[k] as unknown[]) : bad(k));

export function parseSummary(raw: unknown): PayoutSummary {
  const o = obj(raw, "summary");
  const mode = o.payout_mode === "instant" || o.payout_mode === "daily" ? o.payout_mode : bad("payout_mode");
  const s = obj(o.instant_slots, "instant_slots");
  const t = obj(o.today, "today");
  const tot = obj(o.totals_inr, "totals_inr");
  const ns = o.next_settlement == null ? null : obj(o.next_settlement, "next_settlement");
  if (typeof o.bank_payouts_active !== "boolean") bad("bank_payouts_active");
  return {
    payoutMode: mode,
    instantSlots: { limit: inr(s, "limit"), allocated: inr(s, "allocated"), settled: inr(s, "settled"), remaining: inr(s, "remaining") },
    today: { dateIst: str(t, "date_ist"), earnedInr: inr(t, "earned_inr"), bookings: inr(t, "bookings") },
    totalsInr: {
      awaiting_payout: inr(tot, "awaiting_payout"), prepared: inr(tot, "prepared"), processing: inr(tot, "processing"),
      paid: inr(tot, "paid"), failed: inr(tot, "failed"), held: inr(tot, "held"),
    },
    nextSettlement: ns && { batchDateIst: str(ns, "batch_date_ist"), cutoffAt: iso(ns, "cutoff_at"), label: str(ns, "label"), estimatedAmountInr: inr(ns, "estimated_amount_inr") },
    bankPayoutsActive: o.bank_payouts_active as boolean,
    generatedAt: iso(o, "generated_at"),
  };
}

const parseHistoryItem = (v: unknown): PayoutHistoryItem => {
  const o = obj(v, "history item");
  return {
    payoutId: str(o, "payout_id"), payoutType: str(o, "payout_type"), status: str(o, "status"), statusLabel: str(o, "status_label"),
    amountInr: inr(o, "amount_inr"), bookingCount: inr(o, "booking_count"), batchDateIst: strOrNull(o, "batch_date_ist"),
    reference: strOrNull(o, "reference"), createdAt: iso(o, "created_at"), paidAt: isoOrNull(o, "paid_at"), failureReason: strOrNull(o, "failure_reason"),
  };
};
const parsePage = <T>(raw: unknown, item: (v: unknown) => T): Page<T> => {
  const o = obj(raw, "page");
  return { items: arr(o, "items").map(item), nextCursor: strOrNull(o, "next_cursor") };
};
export const parseHistory = (raw: unknown) => parsePage(raw, parseHistoryItem);

export function parseDetail(raw: unknown): PayoutDetail {
  const o = obj(raw, "detail");
  const f = o.failure == null ? null : obj(o.failure, "failure");
  return {
    payoutId: str(o, "payout_id"), payoutType: str(o, "payout_type"), status: str(o, "status"), statusLabel: str(o, "status_label"),
    amountInr: inr(o, "amount_inr"), batchDateIst: strOrNull(o, "batch_date_ist"), cutoffAt: isoOrNull(o, "cutoff_at"),
    reference: strOrNull(o, "reference"), paidAt: isoOrNull(o, "paid_at"), createdAt: iso(o, "created_at"),
    failure: f && { reason: str(f, "reason"), failedAt: iso(f, "failed_at"), nextStep: str(f, "next_step") },
    bookings: arr(o, "bookings").map((b) => {
      const x = obj(b, "booking");
      return {
        bookingId: str(x, "booking_id"), completedAt: iso(x, "completed_at"), serviceEarningInr: inr(x, "service_earning_inr"),
        tipInr: inr(x, "tip_inr"), platformFeeInr: inr(x, "platform_fee_inr"), earningInr: inr(x, "earning_inr"),
        payoutPath: str(x, "payout_path"), instantSlotNo: intOrNull(x, "instant_slot_no"),
      };
    }),
  };
}

export const parseEarnings = (raw: unknown) => parsePage(raw, (v): EarningItem => {
  const o = obj(v, "earning");
  return {
    earningId: str(o, "earning_id"), bookingId: str(o, "booking_id"), completedAt: iso(o, "completed_at"),
    earningInr: inr(o, "earning_inr"), serviceEarningInr: inr(o, "service_earning_inr"), tipInr: inr(o, "tip_inr"),
    platformFeeInr: inr(o, "platform_fee_inr"), status: str(o, "status"), statusLabel: str(o, "status_label"),
    payoutPath: str(o, "payout_path"), instantSlotNo: intOrNull(o, "instant_slot_no"), payoutId: strOrNull(o, "payout_id"),
    expectedSettlementDateIst: strOrNull(o, "expected_settlement_date_ist"),
  };
});

// ---------- RPC client ----------
export type RpcFn = (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;

const defaultRpc: RpcFn = async (name, args) => {
  // RPCs are staged and not in generated types yet.
  const res = await (supabase.rpc as unknown as (n: string, a?: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>)(name, args);
  return res;
};

export function mapRpcError(err: { message?: string; code?: string }): HybridPayoutError {
  const m = `${err.message ?? ""} ${err.code ?? ""}`;
  for (const c of ["not_a_worker", "invalid_cursor", "not_found"] as const) if (m.includes(c)) return new HybridPayoutError(c);
  return new HybridPayoutError("network", "request failed");
}

export const clampLimit = (n: number | undefined) => Math.min(50, Math.max(1, Math.floor(Number(n) || 20)));

export function createHybridPayoutClient(rpc: RpcFn = defaultRpc, enabled: boolean = HYBRID_PAYOUT_UI_ENABLED) {
  const call = async <T>(name: string, args: Record<string, unknown> | undefined, parse: (raw: unknown) => T): Promise<T> => {
    if (!enabled) throw new HybridPayoutError("disabled");
    let res: Awaited<ReturnType<RpcFn>>;
    try { res = await rpc(name, args); } catch { throw new HybridPayoutError("network"); }
    if (res.error) throw mapRpcError(res.error);
    return parse(res.data);
  };
  return {
    getSummary: () => call("get_my_payout_summary", undefined, parseSummary),
    getHistory: (cursor: string | null = null, limit?: number) =>
      call("get_my_payout_history", { p_cursor: cursor, p_limit: clampLimit(limit) }, parseHistory),
    getDetail: (payoutId: string) => call("get_my_payout_detail", { p_payout_id: payoutId }, parseDetail),
    getEarnings: (status: EarningStatus | null = null, cursor: string | null = null, limit?: number) => {
      if (status !== null && !EARNING_STATUSES.includes(status)) throw new HybridPayoutError("malformed", "bad status filter");
      return call("get_my_earnings", { p_status: status, p_cursor: cursor, p_limit: clampLimit(limit) }, parseEarnings);
    },
  };
}
export type HybridPayoutClient = ReturnType<typeof createHybridPayoutClient>;

/** Follow cursors until done; stops on a repeated cursor or page cap so a server bug can't loop forever. */
export async function fetchAllCursorPages<T>(load: (cursor: string | null) => Promise<Page<T>>, maxPages = 50): Promise<T[]> {
  const out: T[] = []; const seen = new Set<string>(); let cursor: string | null = null;
  for (let i = 0; i < maxPages; i++) {
    const page = await load(cursor);
    out.push(...page.items);
    if (!page.nextCursor || seen.has(page.nextCursor)) break;
    seen.add(page.nextCursor); cursor = page.nextCursor;
  }
  return out;
}

// ---------- view mapping (display only) ----------
/** Colour/icon only; the text shown is always the server's status_label. Paid needs paid_at. */
export function contractStatusState(status: string, paidAt: string | null): PayoutDisplayState {
  switch (status) {
    case "paid": return paidAt ? "paid" : "processing";
    case "initiating": case "processing": return "processing";
    case "held": return "on_hold";
    case "failed": case "retry_scheduled": return "failed";
    case "reversed": case "dismissed": return "reversed";
    default: return "awaiting"; // prepared, created, pending, awaiting_payout, unknown future values
  }
}

export const summaryToInstantView = (s: PayoutSummary): InstantProgressView =>
  ({ slotsTotal: s.instantSlots.limit, slotsAllocated: s.instantSlots.allocated, slotsSettled: s.instantSlots.settled });

export const summaryToDailyView = (s: PayoutSummary): DailyScheduleView =>
  ({ nextPayoutAt: s.nextSettlement?.cutoffAt ?? null, transfersActive: s.bankPayoutsActive });

export const isKnownPayoutType = (t: string): t is PayoutType => (PAYOUT_TYPES as string[]).includes(t);

export function historyToConsolidated(h: PayoutHistoryItem, detail?: PayoutDetail | null): ConsolidatedPayoutView {
  return {
    id: h.payoutId, kind: h.payoutType === "daily_batch" ? "daily" : "instant", amount: h.amountInr,
    status: h.status, statusLabel: h.statusLabel, paidAt: h.paidAt, reference: h.reference,
    failureReason: detail?.failure?.reason ?? h.failureReason, bookingCount: h.bookingCount,
    bookings: detail ? detail.bookings.map((b) => ({ bookingId: b.bookingId, amount: b.earningInr })) : [],
  };
}

/** Manual payouts show as confirmed only when server status is paid with a paid_at date. */
export const historyToManual = (h: PayoutHistoryItem): ManualPayoutView | null =>
  h.payoutType !== "manual" ? null
    : { amount: h.amountInr, paidAt: h.paidAt ?? h.createdAt, reference: h.reference, verified: h.status === "paid" && !!h.paidAt };
