import { describe, it, expect } from "vitest";
import { collectWorkerUpi, validateBankInput, submitSecureBankDetails } from "../bankOnboarding";
import { clearAccountBrowserData, confirmedMissingWorker, ACCOUNT_STORAGE_KEYS } from "../accountDataCleanup";
import { summaryToInstantView, summaryToDailyView, parseSummary } from "../hybridPayoutApi";

describe("approved bank-first onboarding", () => {
  const bank = { holder: "Test Worker", account: "123456789", confirmation: "123456789", ifsc: "HDFC0001234" };
  it("requires a bank account even when UPI would be present", () => {
    expect(validateBankInput({ ...bank, account: "", confirmation: "" })).toBe("Account number must be 9–18 digits");
    expect(validateBankInput(bank)).toBeNull();
  });
  it("requires matching confirmation", () => {
    expect(validateBankInput({ ...bank, confirmation: "999999999" })).toBe("Account numbers do not match");
  });
  it("defaults UPI collection OFF unless the Admin explicitly enables it", () => {
    for (const value of [null, {}, { bank_required: true, collect_worker_upi: false }, { bank_required: true, collect_worker_upi: "true" }]) expect(collectWorkerUpi(value)).toBe(false);
    expect(collectWorkerUpi({ bank_required: true, collect_worker_upi: true })).toBe(true);
  });
  it("never falls back to unsafe saving when the secure Admin writer is missing", async () => {
    await expect(submitSecureBankDetails()).rejects.toThrow("Bank setup is temporarily unavailable");
  });
  it("clears deleted account state and retains language", () => {
    const local = new Map<string, string>([["language", "te"], ...ACCOUNT_STORAGE_KEYS.map(key => [key, "old-account"] as [string, string])]);
    const session = new Map<string, string>([["didi_otp_verify_state", "old-account"]]);
    clearAccountBrowserData({ removeItem: key => { local.delete(key); } }, { removeItem: key => { session.delete(key); } });
    expect([...local.entries()]).toEqual([["language", "te"]]);
    expect(session.size).toBe(0);
  });
  it("does not treat a failed worker read as deletion", () => {
    expect(confirmedMissingWorker({ data: null, error: null }, { data: null, error: new Error("offline") })).toBe(false);
    expect(confirmedMissingWorker({ data: null, error: null }, { data: { id: "own" }, error: null })).toBe(false);
    expect(confirmedMissingWorker({ data: null, error: null }, { data: null, error: null })).toBe(true);
  });
  it("copies remaining counts and settlement amounts from the server unchanged", () => {
    const summary = parseSummary({ payout_mode: "instant", instant_slots: { limit: 10, allocated: 8, settled: 3, remaining: 7 }, today: { date_ist: "2026-11-26", earned_inr: 500, bookings: 2 }, totals_inr: { awaiting_payout: 700, prepared: 0, processing: 0, paid: 100, failed: 0, held: 0 }, next_settlement: { batch_date_ist: "2026-11-26", cutoff_at: "2026-11-26T13:30:00Z", label: "Today 7 PM", estimated_amount_inr: 700 }, bank_payouts_active: false, generated_at: "2026-11-26T08:00:00Z" });
    expect(summaryToInstantView(summary).slotsRemaining).toBe(7);
    expect(summaryToDailyView(summary)).toMatchObject({ settlementAmount: 700, nextPayoutAt: "2026-11-26T13:30:00Z" });
  });
});