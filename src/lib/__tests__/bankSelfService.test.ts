import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
import { bankStatusFor, canSubmitBank, parseSubmitBankResponse, submitMyBankDetails } from "../bankSelfService";
import { parsePayoutReadiness, readinessAllowsBookings } from "../payoutBookingGate";
import { supabase } from "@/integrations/supabase/client";

const r = (o: Record<string, unknown>) => parsePayoutReadiness({ worker_id: "w", has_bank_details: false, beneficiary_registered: false, admin_approved: true, ready: false, missing: [], enforced: false, ...o });
const bank = { holder: "Asha", account: "123456789", confirmation: "123456789", ifsc: "hdfc0001234", bankName: "HDFC" };

describe("bank self-service", () => {
  it("no bank details → form offered", () => { expect(bankStatusFor(r({}))).toBe("none"); expect(canSubmitBank("none")).toBe(true); });
  it("submitted, not registered → pending, no form", () => { expect(bankStatusFor(r({ has_bank_details: true }))).toBe("pending"); expect(canSubmitBank("pending")).toBe(false); });
  it("beneficiary registered → verified", () => expect(bankStatusFor(r({ has_bank_details: true, beneficiary_registered: true }))).toBe("verified"));
  it("server failed → failed, form offered again", () => { expect(bankStatusFor(r({ has_bank_details: true, bank_verification_status: "failed" }))).toBe("failed"); expect(canSubmitBank("failed")).toBe(true); });
  it("unknown read → no status", () => expect(bankStatusFor(null)).toBeNull());
  it("masked last4 only accepts 4 digits", () => { expect(r({ bank_account_last4: "1234" })?.accountLast4).toBe("1234"); expect(r({ bank_account_last4: "123456789" })?.accountLast4).toBeNull(); });
  it("missing bank never blocks bookings while Admin switch is off", () => expect(readinessAllowsBookings(r({}))).toBe(true));
  it("missing server function → unavailable", () => expect(parseSubmitBankResponse(null, { code: "PGRST202", message: "Could not find the function" })).toEqual({ ok: false, error: "unavailable" }));
  it("duplicate → already_submitted", () => expect(parseSubmitBankResponse({ ok: false, error: "already_submitted" }, null)).toEqual({ ok: false, error: "already_submitted" }));
  it("double tap sends one request, without worker id", async () => {
    const call = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });
    const [a, b] = await Promise.all([submitMyBankDetails(bank, call), submitMyBankDetails(bank, call)]);
    expect(a).toEqual({ ok: true }); expect(b).toEqual({ ok: true });
    expect(call).toHaveBeenCalledTimes(1);
    expect(call.mock.calls[0][1]).not.toHaveProperty("p_worker_id");
    expect(call.mock.calls[0][1].p_ifsc).toBe("HDFC0001234");
  });
  it("keeps the Supabase receiver when connecting reviewed bank details to Admin", async () => {
    vi.mocked(supabase.rpc).mockImplementationOnce(function (this: typeof supabase) {
      expect(this).toBe(supabase);
      return Promise.resolve({ data: { ok: true }, error: null }) as never;
    });
    expect(await submitMyBankDetails(bank)).toEqual({ ok: true });
  });
});
