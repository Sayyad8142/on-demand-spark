import { describe, it, expect, vi } from "vitest";
import { registerWorkerV2, parseRegistrationResponse, toE164India, REGISTRATION_ERROR_TEXT, readCollectWorkerUpi, holdSignupBank, takeSignupBank, peekSignupBank } from "../bankOnboarding";
import { parsePayoutReadiness, readinessAllowsBookings } from "../payoutBookingGate";
import { parseSummary, summaryToInstantView, summaryToDailyView } from "../hybridPayoutApi";
import { formatSettlementTime } from "@/components/payouts/hybrid/HybridPayoutCards";

const bank = { holder: "Sita Devi", account: "123456789012", confirmation: "123456789012", ifsc: "hdfc0001234", bankName: "HDFC Bank" };
const input = { fullName: " Sita Devi ", phone: "98765 43210", services: ["maid"], community: "phf", bank };

describe("register_worker_v2", () => {
  it("sends the exact Admin contract with +91 phone and UPI null when not collected", async () => {
    const call = vi.fn().mockResolvedValue({ data: { ok: true, worker_id: "w1", approval_status: "pending_approval", payout_readiness: { ready: false } }, error: null });
    const r = await registerWorkerV2(input, call);
    expect(call).toHaveBeenCalledWith("register_worker_v2", {
      p_full_name: "Sita Devi", p_phone: "+919876543210", p_account_holder: "Sita Devi", p_account_number: "123456789012",
      p_confirm_account_number: "123456789012", p_ifsc: "HDFC0001234", p_bank_name: "HDFC Bank", p_service_types: ["maid"], p_community: "phf", p_upi_id: null,
    });
    expect(r).toEqual({ ok: true, workerId: "w1", approvalStatus: "pending_approval", bankDetailsProvided: false, payoutReadiness: { ready: false } });
  });
  it("maps every server validation error to a worker message", () => {
    for (const code of ["invalid_phone", "invalid_account", "account_mismatch", "invalid_ifsc", "phone_already_registered", "name_required", "bank_name_required", "community_required", "service_required", "verified_phone_mismatch"]) {
      const r = parseRegistrationResponse({ error: code });
      expect(r).toEqual({ ok: false, error: code });
      expect(REGISTRATION_ERROR_TEXT[code as keyof typeof REGISTRATION_ERROR_TEXT]).toBeTruthy();
    }
    expect(parseRegistrationResponse({ error: "something_new" })).toEqual({ ok: false, error: "unknown" });
    expect(parseRegistrationResponse(null)).toEqual({ ok: false, error: "unknown" });
  });
  it("treats an RPC failure as not registered", async () => {
    expect(await registerWorkerV2(input, vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } }))).toEqual({ ok: false, error: "unknown" });
  });
  it("normalises phone to +91 and 10 digits", () => {
    expect(toE164India("+91 98765-43210")).toBe("+919876543210");
    expect(toE164India("9876543210")).toBe("+919876543210");
  });
  it("keeps bank details in memory only until taken", () => {
    holdSignupBank(bank);
    expect(peekSignupBank()).toEqual(bank);
    expect(takeSignupBank()).toEqual(bank);
    expect(peekSignupBank()).toBeNull();
  });
});

describe("Admin-controlled UPI", () => {
  it("shows UPI only when Admin returns collect_worker_upi true", async () => {
    expect(await readCollectWorkerUpi(vi.fn().mockResolvedValue({ data: { collect_worker_upi: false, bank_required: true }, error: null }))).toBe(false);
    expect(await readCollectWorkerUpi(vi.fn().mockResolvedValue({ data: { collect_worker_upi: true, bank_required: true }, error: null }))).toBe(true);
    expect(await readCollectWorkerUpi(vi.fn().mockResolvedValue({ data: null, error: { message: "x" } }))).toBe(false);
  });
});

describe("payout readiness gate", () => {
  const r = (o: Record<string, unknown>) => parsePayoutReadiness({ worker_id: "w", has_bank_details: true, beneficiary_registered: true, admin_approved: true, ready: true, missing: [], enforced: true, ...o });
  it("allows bookings when Admin says ready", () => {
    expect(readinessAllowsBookings(r({}))).toBe(true);
  });
  it("bank never blocks even when Admin's switch is on and the server says not ready", () => {
    expect(readinessAllowsBookings(r({ ready: false, beneficiary_registered: false }))).toBe(true);
  });
  it("switch off: existing workers keep bookings, even with no bank yet", () => {
    expect(readinessAllowsBookings(r({ ready: false, enforced: false, has_bank_details: false, beneficiary_registered: false }))).toBe(true);
  });
  it("unknown or malformed readiness never invents a block (server still enforces)", () => {
    expect(readinessAllowsBookings(null)).toBe(true);
    expect(parsePayoutReadiness({ ready: "true" })).toBeNull();
  });
});

describe("live payout summary contract", () => {
  const live = {
    worker_id: "w", programme: "cashfree_imps", successful_count: 3, remaining_count: 7, reserved_count: 1, payout_mode: "instant",
    instant_slots: { limit: 10, allocated: 4, settled: 3, remaining: 7 }, pending_earnings_inr: 850,
    today: { date_ist: "2026-11-26", earned_inr: 500, bookings: 2 },
    totals_inr: { awaiting_payout: 700, prepared: 0, processing: 150, paid: 100, failed: 0, held: 0 },
    next_settlement: { batch_date_ist: "2026-11-26", cutoff_at: "2026-11-26T19:00:00+05:30", time_ist: "19:00:00", estimated_amount_inr: 400, estimated: true },
    payout_readiness: {}, bank_payouts_active: false, generated_at: "2026-11-26T08:00:00Z",
  };
  it("shows the server's successful IMPS count and remaining instant payouts", () => {
    const s = parseSummary(live);
    expect(summaryToInstantView(s)).toMatchObject({ slotsTotal: 10, slotsSettled: 3, slotsRemaining: 7 });
    expect(s.pendingEarningsInr).toBe(850);
  });
  it("uses the server settlement time and amount", () => {
    const d = summaryToDailyView(parseSummary(live));
    expect(d).toMatchObject({ settlementAmount: 400, settlementTimeIst: "19:00:00" });
    expect(formatSettlementTime("19:00:00")).toBe("7:00 PM");
  });
});
