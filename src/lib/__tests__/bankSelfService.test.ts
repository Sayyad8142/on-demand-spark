import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
import { bankStatusFor, canSubmitBank, parseBankDetails, parseSubmitBankResponse, submitMyBankDetails, readMyBankDetails } from "../bankSelfService";
import { supabase } from "@/integrations/supabase/client";

const raw = { status: "not_submitted", can_edit: true, restricts_work: false };
const bank = { holder: "Asha", account: "123456789", confirmation: "123456789", ifsc: "hdfc0001234", bankName: "HDFC" };
describe("deployed Admin bank contract", () => {
  it("not submitted allows manual entry", () => {
    const d = parseBankDetails(raw); expect(bankStatusFor(d)).toBe("none"); expect(canSubmitBank(d)).toBe(true);
  });
  it("verified shows a locked account even if a malformed permission says true", () => {
    const d = parseBankDetails({ ...raw, status: "verified" }); expect(bankStatusFor(d)).toBe("verified"); expect(canSubmitBank(d)).toBe(false);
  });
  it("pending respects the server editing permission", () => {
    expect(canSubmitBank(parseBankDetails({ ...raw, status: "pending", can_edit: true }))).toBe(true);
    expect(canSubmitBank(parseBankDetails({ ...raw, status: "pending", can_edit: false }))).toBe(false);
  });
  it("failed verification permits corrections only when can_edit is true", () => {
    expect(canSubmitBank(parseBankDetails({ ...raw, status: "verification_failed", can_edit: true }))).toBe(true);
    expect(canSubmitBank(parseBankDetails({ ...raw, status: "verification_failed", can_edit: false }))).toBe(false);
  });
  it("retains Admin rejection reason but never full account number or unknown fields", () => {
    const d = parseBankDetails({ ...raw, status: "verification_failed", failure_reason: "Incorrect IFSC", account_number_masked: "123456789012", account_number: "123456789012" });
    expect(d?.failureReason).toBe("Incorrect IFSC"); expect(d?.accountNumberMasked).toBeNull(); expect(d).not.toHaveProperty("account_number");
    expect(parseBankDetails({ ...raw, account_number_masked: "XXXX9012" })?.accountNumberMasked).toBe("XXXX9012");
  });
  it("unknown status or absent edit permission never opens a form", () => {
    expect(parseBankDetails({ status: "pending" })).toBeNull(); expect(parseBankDetails({ ...raw, status: "new_status" })).toBeNull(); expect(canSubmitBank(null)).toBe(false);
  });
  it("reads only the parameterless own-bank RPC", async () => {
    const call = vi.fn().mockResolvedValue({ data: raw, error: null });
    expect(await readMyBankDetails(call)).toEqual(parseBankDetails(raw)); expect(call).toHaveBeenCalledWith("get_my_bank_details");
  });
  it("double taps send once with the exact deployed submit parameter names", async () => {
    const call = vi.fn().mockResolvedValue({ data: { success: true, outcome: "submitted", bank: raw }, error: null });
    const [a, b] = await Promise.all([submitMyBankDetails(bank, call), submitMyBankDetails(bank, call)]);
    expect(a).toEqual({ ok: true, outcome: "submitted", bank: parseBankDetails(raw) }); expect(b).toEqual(a);
    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith("submit_my_bank_details", { p_account_holder_name: "Asha", p_account_number: "123456789", p_account_number_confirm: "123456789", p_ifsc: "HDFC0001234", p_bank_name: "HDFC" });
  });
  it("unchanged duplicate is a server-confirmed success without inventing verification", () => {
    expect(parseSubmitBankResponse({ success: true, outcome: "unchanged", bank: { ...raw, status: "pending" } }, null)).toMatchObject({ ok: true, outcome: "unchanged", bank: { status: "pending" } });
  });
  it.each(["account_holder_required", "invalid_account", "account_mismatch", "invalid_ifsc", "bank_name_required", "verified_account_locked", "bank_blocked", "same_details_as_failed", "too_many_attempts", "worker_not_found", "not_signed_in"])("handles deployed validation error %s without success", (error) => {
    expect(parseSubmitBankResponse({ error }, null)).toMatchObject({ ok: false, error });
  });
  it("five-per-24-hour server limit never retries or marks submitted", async () => {
    const call = vi.fn().mockResolvedValue({ data: { error: "too_many_attempts" }, error: null });
    expect(await submitMyBankDetails(bank, call)).toMatchObject({ ok: false, error: "too_many_attempts" }); expect(call).toHaveBeenCalledOnce();
  });
  it("legacy ok answer and unknown outcome cannot authorize success", () => {
    expect(parseSubmitBankResponse({ ok: true }, null)).toMatchObject({ ok: false });
    expect(parseSubmitBankResponse({ success: true, outcome: "new" }, null)).toMatchObject({ ok: false });
  });
  it("keeps the Supabase receiver", async () => {
    vi.mocked(supabase.rpc).mockImplementationOnce(function (this: typeof supabase) {
      expect(this).toBe(supabase); return Promise.resolve({ data: { success: true, outcome: "submitted", bank: raw }, error: null }) as never;
    });
    expect(await submitMyBankDetails(bank)).toMatchObject({ ok: true });
  });
});
