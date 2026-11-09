import { describe, it, expect } from "vitest";
import { mapPayoutStatus, computePayoutTotals, payoutReference, istDayKey, istStartOfWeek } from "../payoutDisplay";
import { fetchAllPages } from "../workerPayoutsApi";
import { normalizeInstantProgress, instantSlotsExhausted, consolidatedMatches, HYBRID_PAYOUT_UI_ENABLED } from "../hybridPayout";

const row = (status: string, amount: number, created_at: string, paid_at: string | null = null) => ({ status, payout_amount: amount, created_at, paid_at });

describe("payout status mapping", () => {
  it("shows Paid only when status is paid AND paid_at is set", () => {
    expect(mapPayoutStatus("paid", "2026-11-09T10:00:00Z")).toBe("paid");
    expect(mapPayoutStatus("paid", null)).toBe("processing");
  });
  it("never shows Paid for processing, created, pending, unknown or empty", () => {
    for (const s of ["processing", "created", "pending", "approved", "weird", "", null]) {
      expect(mapPayoutStatus(s, "2026-11-09T10:00:00Z")).not.toBe("paid");
    }
    expect(mapPayoutStatus("created")).toBe("awaiting");
    expect(mapPayoutStatus("unknown_new_status")).toBe("awaiting");
  });
  it("keeps failed and reversed separate", () => {
    expect(mapPayoutStatus("failed")).toBe("failed");
    expect(mapPayoutStatus("reversed", "2026-11-09T10:00:00Z")).toBe("reversed");
    expect(mapPayoutStatus("held")).toBe("on_hold");
  });
});

describe("payout totals", () => {
  const now = new Date("2026-11-10T06:00:00Z"); // Tue 11:30 IST
  it("excludes failed and reversed from earned totals", () => {
    const t = computePayoutTotals([
      row("paid", 300, "2026-11-10T04:00:00Z", "2026-11-10T05:00:00Z"),
      row("failed", 200, "2026-11-10T04:00:00Z"),
      row("reversed", 100, "2026-11-10T04:00:00Z"),
      row("created", 50, "2026-11-10T04:00:00Z"),
    ], now);
    expect(t.today).toBe(350);
    expect(t.total).toBe(350);
    expect(t.paid).toBe(300);
    expect(t.awaiting).toBe(50);
    expect(t.failed).toBe(300);
  });
  it("counts Paid only for confirmed paid rows", () => {
    const t = computePayoutTotals([row("paid", 400, "2026-11-10T04:00:00Z", null)], now);
    expect(t.paid).toBe(0);
    expect(t.processing).toBe(400);
  });
  it("uses India time for today: 00:10 IST counts, 23:50 IST previous day does not", () => {
    const t = computePayoutTotals([
      row("created", 100, "2026-11-09T18:40:00Z"), // 00:10 IST Nov 10
      row("created", 70, "2026-11-09T18:20:00Z"),  // 23:50 IST Nov 9
    ], now);
    expect(t.today).toBe(100);
  });
  it("estimates never enter the totals", () => {
    const t = computePayoutTotals([{ ...row("estimating", 500, "2026-11-10T04:00:00Z"), isEstimate: true }], now);
    expect(t.total).toBe(0);
    expect(t.earnedNotRecorded).toBe(500);
  });
  it("week starts Monday 00:00 IST", () => {
    expect(istStartOfWeek(now).toISOString()).toBe("2026-11-08T18:30:00.000Z");
    expect(istDayKey("2026-11-09T18:30:00Z")).toBe("2026-11-10");
  });
});

describe("reference number", () => {
  const base = { manual_utr: null, reference_id: null, external_reference: "UTR123" };
  it("comes from the server reference fields, only when paid", () => {
    expect(payoutReference({ ...base, status: "paid", paid_at: "2026-11-09T10:00:00Z" })).toBe("UTR123");
    expect(payoutReference({ ...base, status: "failed", paid_at: null })).toBeNull();
    expect(payoutReference({ ...base, manual_utr: "MAN9", status: "paid", paid_at: "2026-11-09T10:00:00Z" })).toBe("MAN9");
  });
});

describe("paginated payout fetch", () => {
  it("reads every page so totals are not capped at 1000", async () => {
    const all = Array.from({ length: 2345 }, (_, i) => ({ id: String(i) }));
    const rows = await fetchAllPages(async (from, to) => ({ data: all.slice(from, to + 1) as never, error: null }));
    expect(rows).toHaveLength(2345);
  });
  it("throws on error instead of returning partial totals", async () => {
    await expect(fetchAllPages(async () => ({ data: null, error: new Error("x") }))).rejects.toThrow();
  });
});

describe("hybrid payout placeholders", () => {
  it("stays disconnected from production", () => {
    expect(HYBRID_PAYOUT_UI_ENABLED).toBe(false);
  });
  it("never shows more settled or allocated than the total", () => {
    expect(normalizeInstantProgress({ slotsTotal: 10, slotsAllocated: 12, slotsSettled: 15 })).toEqual({ slotsTotal: 10, slotsAllocated: 10, slotsSettled: 10 });
    expect(instantSlotsExhausted({ slotsTotal: 10, slotsAllocated: 10, slotsSettled: 3 })).toBe(true);
    expect(instantSlotsExhausted({ slotsTotal: 10, slotsAllocated: 3, slotsSettled: 3 })).toBe(false);
  });
  it("flags a daily payout whose bookings don't add up", () => {
    const p = { id: "1", kind: "daily" as const, amount: 400, status: "paid", paidAt: null, reference: null, failureReason: null, bookings: [{ bookingId: "a", amount: 200 }, { bookingId: "b", amount: 150 }] };
    expect(consolidatedMatches(p)).toBe(false);
    expect(consolidatedMatches({ ...p, amount: 350 })).toBe(true);
  });
});
