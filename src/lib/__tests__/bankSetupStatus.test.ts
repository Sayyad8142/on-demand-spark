import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
import { parseBankDetails, bankSetupFor, canSubmitBank, failureReasonText, parseSubmitBankResponse } from "../bankSelfService";

// Shapes copied from the live Admin worker_bank_status_core answer.
const base = { status: "pending", can_edit: true, restricts_work: false, account_number_masked: "XXXX1782" };

describe("bank_setup_status drives the visible label", () => {
  it("Cashfree-registered account shows Registered even though legacy status says pending", () => {
    const d = parseBankDetails({ ...base, can_edit: false, payout_registration: "registered", bank_setup_status: "registered" });
    expect(bankSetupFor(d)).toBe("registered");
    expect(canSubmitBank(d)).toBe(false);
  });
  it.each(["registering", "retrying"])("saved but %s with Cashfree shows Bank details saved", (s) => {
    expect(bankSetupFor(parseBankDetails({ ...base, bank_setup_status: s }))).toBe("saved");
  });
  it("incorrect details show Correction required with the actual reason", () => {
    const d = parseBankDetails({ ...base, status: "verification_failed", failure_reason: "[permanent] Invalid IFSC for this account", bank_setup_status: "needs_correction" });
    expect(bankSetupFor(d)).toBe("correction");
    expect(failureReasonText(d!.failureReason)).toBe("Invalid IFSC for this account");
  });
  it("duplicate-account safety review stays a review, never Registered", () => {
    expect(bankSetupFor(parseBankDetails({ ...base, payout_registration: "review_required", bank_setup_status: "review_required", manual_approval_required: true }))).toBe("review");
  });
  it("not submitted shows no badge state", () => {
    expect(bankSetupFor(parseBankDetails({ ...base, status: "not_submitted", bank_setup_status: "not_submitted" }))).toBe("none");
  });
  it("an unknown bank_setup_status is rejected instead of guessed", () => {
    expect(parseBankDetails({ ...base, bank_setup_status: "something_new" })).toBeNull();
  });
  it("older answers without bank_setup_status fall back to legacy fields", () => {
    expect(bankSetupFor(parseBankDetails({ ...base, payout_registration: "registered" }))).toBe("registered");
    expect(bankSetupFor(parseBankDetails(base))).toBe("saved");
    expect(bankSetupFor(parseBankDetails({ ...base, status: "verification_failed" }))).toBe("correction");
  });
  it("submitting over a registered account reports the registered lock, not a generic failure", () => {
    expect(parseSubmitBankResponse({ error: "registered_account_locked", bank: { ...base, can_edit: false, bank_setup_status: "registered" } }, null)).toMatchObject({ ok: false, error: "registered_account_locked", bank: { setup: "registered" } });
  });
});
