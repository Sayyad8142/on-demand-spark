// Mock fixtures follow WORKER_APP_API_CONTRACT.md v1. Test data only — never real money.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import fs from "fs";
import path from "path";
import i18n from "@/i18n";
import {
  createHybridPayoutClient, contractStatusState, fetchAllCursorPages, historyToConsolidated, historyToManual,
  parseSummary, clampLimit, HybridPayoutError, type RpcFn,
} from "../hybridPayoutApi";
import { HYBRID_PAYOUT_UI_ENABLED } from "../hybridPayout";
import { HybridPayoutSection } from "@/components/payouts/hybrid/HybridPayoutSection";

const summary = (o: Record<string, unknown> = {}) => ({
  worker_id: "w1", payout_mode: "instant",
  instant_slots: { limit: 10, allocated: 4, settled: 3, remaining: 6 },
  today: { date_ist: "2026-11-10", earned_inr: 450, bookings: 2 },
  totals_inr: { awaiting_payout: 900, prepared: 300, processing: 0, paid: 12000, failed: 0, held: 0 },
  next_settlement: null, bank_payouts_active: true, generated_at: "2026-11-10T01:00:00Z", ...o,
});
const item = (o: Record<string, unknown> = {}) => ({
  payout_id: "p1", payout_type: "daily_batch", status: "paid", status_label: "Paid", amount_inr: 1350, booking_count: 3,
  batch_date_ist: "2026-11-09", reference: "UTR123", created_at: "2026-11-09T13:30:00Z", paid_at: "2026-11-09T14:00:00Z", failure_reason: null, ...o,
});
const detail = {
  payout_id: "p1", payout_type: "daily_batch", status: "paid", status_label: "Paid", amount_inr: 1350, batch_date_ist: "2026-11-09",
  cutoff_at: "2026-11-09T13:30:00Z", reference: "UTR123", paid_at: "2026-11-09T14:00:00Z", created_at: "2026-11-09T13:30:00Z", failure: null,
  bookings: [400, 450, 500].map((e, i) => ({ booking_id: `b${i}aaaaaaa`, completed_at: "2026-11-09T05:00:00Z", service_earning_inr: e, tip_inr: 0, platform_fee_inr: 0, earning_inr: e, payout_path: "daily", instant_slot_no: null })),
};
const mockRpc = (map: Record<string, unknown | ((a?: Record<string, unknown>) => unknown)>): RpcFn =>
  vi.fn(async (name, args) => {
    const v = map[name];
    if (v instanceof Error) return { data: null, error: { message: v.message } };
    return { data: typeof v === "function" ? (v as (a?: Record<string, unknown>) => unknown)(args) : v, error: null };
  });

describe("hybrid payout adapter", () => {
  it("is switched off by default and makes no calls when off", async () => {
    expect(HYBRID_PAYOUT_UI_ENABLED).toBe(false);
    const rpc = mockRpc({});
    await expect(createHybridPayoutClient(rpc, false).getSummary()).rejects.toMatchObject({ code: "disabled" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("never sends a worker id", async () => {
    const rpc = mockRpc({ get_my_payout_summary: summary(), get_my_payout_history: { items: [], next_cursor: null }, get_my_payout_detail: detail, get_my_earnings: { items: [], next_cursor: null } });
    const c = createHybridPayoutClient(rpc, true);
    await c.getSummary(); await c.getHistory(); await c.getDetail("p1"); await c.getEarnings("awaiting_payout");
    for (const [, args] of (rpc as ReturnType<typeof vi.fn>).mock.calls) expect(JSON.stringify(args ?? {})).not.toMatch(/worker/);
  });

  it("instant slots: 4 of 10 instant; 10 of 10 daily", () => {
    const s = parseSummary(summary());
    expect(s.payoutMode).toBe("instant");
    expect(s.instantSlots).toEqual({ limit: 10, allocated: 4, settled: 3, remaining: 6 });
    expect(parseSummary(summary({ payout_mode: "daily", instant_slots: { limit: 10, allocated: 10, settled: 10, remaining: 0 } })).payoutMode).toBe("daily");
  });

  it("daily batch next settlement parsed from server, not calculated", () => {
    const s = parseSummary(summary({ payout_mode: "daily", next_settlement: { batch_date_ist: "2026-11-10", cutoff_at: "2026-11-10T13:30:00Z", label: "Today 7:00 PM", estimated_amount_inr: 900 } }));
    expect(s.nextSettlement).toEqual({ batchDateIst: "2026-11-10", cutoffAt: "2026-11-10T13:30:00Z", label: "Today 7:00 PM", estimatedAmountInr: 900 });
  });

  it("rejects malformed money (decimal, negative, string) and bad mode", () => {
    for (const bad of [450.5, -1, "450"]) expect(() => parseSummary(summary({ today: { date_ist: "x", earned_inr: bad, bookings: 1 } }))).toThrow(HybridPayoutError);
    expect(() => parseSummary(summary({ payout_mode: "weekly" }))).toThrow(HybridPayoutError);
    expect(() => parseSummary(null)).toThrow(HybridPayoutError);
  });

  it("maps server error codes", async () => {
    const c = createHybridPayoutClient(mockRpc({ get_my_payout_summary: new Error("not_a_worker"), get_my_payout_detail: new Error("not_found"), get_my_payout_history: new Error("invalid_cursor") }), true);
    await expect(c.getSummary()).rejects.toMatchObject({ code: "not_a_worker" });
    await expect(c.getDetail("other")).rejects.toMatchObject({ code: "not_found" });
    await expect(c.getHistory("junk")).rejects.toMatchObject({ code: "invalid_cursor" });
  });

  it("statuses: Paid needs paid_at; unknown future status falls back neutral", () => {
    expect(contractStatusState("paid", "2026-11-09T14:00:00Z")).toBe("paid");
    expect(contractStatusState("paid", null)).toBe("processing");
    expect(contractStatusState("retry_scheduled", null)).toBe("failed");
    expect(contractStatusState("held", null)).toBe("on_hold");
    expect(contractStatusState("dismissed", null)).toBe("reversed");
    expect(contractStatusState("something_new", null)).toBe("awaiting");
  });

  it("payout breakdown uses server per-booking earnings", async () => {
    const d = await createHybridPayoutClient(mockRpc({ get_my_payout_detail: detail }), true).getDetail("p1");
    const v = historyToConsolidated((await createHybridPayoutClient(mockRpc({ get_my_payout_history: { items: [item()], next_cursor: null } }), true).getHistory()).items[0], d);
    expect(v.bookings.map((b) => b.amount)).toEqual([400, 450, 500]);
    expect(v.bookingCount).toBe(3);
    expect(v.amount).toBe(1350);
  });

  it("manual payment verified only when paid with paid_at", async () => {
    const h = (await createHybridPayoutClient(mockRpc({ get_my_payout_history: { items: [item({ payout_type: "manual" }), item({ payout_id: "p2", payout_type: "manual", status: "processing", status_label: "Processing", paid_at: null })], next_cursor: null } }), true).getHistory()).items;
    expect(historyToManual(h[0])).toMatchObject({ verified: true, reference: "UTR123" });
    expect(historyToManual(h[1])?.verified).toBe(false);
  });

  it("pagination follows cursors, clamps limit, stops on repeated cursor", async () => {
    const pages: Record<string, unknown> = { start: { items: [item()], next_cursor: "c1" }, c1: { items: [item({ payout_id: "p2" })], next_cursor: "c1" } };
    const c = createHybridPayoutClient(mockRpc({ get_my_payout_history: (a) => pages[(a?.p_cursor as string) ?? "start"] }), true);
    const all = await fetchAllCursorPages((cur) => c.getHistory(cur, 500));
    expect(all.map((x) => x.payoutId)).toEqual(["p1", "p2"]);
    expect([clampLimit(500), clampLimit(0), clampLimit(undefined)]).toEqual([50, 1, 20]);
  });

  it("old-app compatibility: existing screens still read worker_payouts and import no adapter", () => {
    for (const f of ["Profile.tsx", "Bookings.tsx", "CompleteBooking.tsx"]) {
      expect(fs.readFileSync(path.join(__dirname, "../../pages", f), "utf8")).not.toMatch(/hybridPayoutApi|HybridPayoutSection/);
    }
    expect(fs.readFileSync(path.join(__dirname, "../../pages/Earnings.tsx"), "utf8")).toMatch(/HYBRID_PAYOUT_UI_ENABLED && workerId && <HybridPayoutSection/);
  });
});

describe("hybrid payout section", () => {
  const client = () => createHybridPayoutClient(mockRpc({
    get_my_payout_summary: summary({ bank_payouts_active: false }),
    get_my_payout_history: (a) => (a?.p_cursor ? { items: [item({ payout_id: "p2", payout_type: "manual" })], next_cursor: null } : { items: [item()], next_cursor: "c1" }),
    get_my_payout_detail: detail,
  }), true);

  it("renders nothing when disabled", () => {
    const { container } = render(<HybridPayoutSection enabled={false} client={client()} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing on malformed server data (falls back to old screens)", async () => {
    const c = createHybridPayoutClient(mockRpc({ get_my_payout_summary: { bogus: true }, get_my_payout_history: { items: [], next_cursor: null } }), true);
    const { container } = render(<HybridPayoutSection enabled client={c} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(container.innerHTML).toBe("");
  });

  it("shows slots, manual-mode note, history, show more and breakdown", async () => {
    render(<HybridPayoutSection enabled client={client()} />);
    await screen.findByTestId("instant-progress");
    expect(screen.getByTestId("manual-mode-note")).toBeTruthy();
    expect(screen.getByText("₹1350")).toBeTruthy();
    fireEvent.click(screen.getByText("Show more"));
    await screen.findByTestId("manual-payout");
    fireEvent.click(screen.getByText("₹1350").closest("button")!);
    await waitFor(() => expect(screen.getByText("₹500")).toBeTruthy());
  });

  it.each(["en", "hi", "te"])("has the manual-mode text in %s", async (lng) => {
    await i18n.changeLanguage(lng);
    const key = "worker.Payouts_are_being_sent_manually_by_Didi_Now_Your_earnings_are_recorded";
    expect(i18n.exists(key)).toBe(true);
    await i18n.changeLanguage("en");
  });
});
