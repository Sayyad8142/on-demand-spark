import { describe, it, expect, vi } from "vitest";
import { registerWorkerV2, validateOptionalSignupBank, parseRegistrationResponse } from "@/lib/bankOnboarding";

const base = { fullName: "Asha", phone: "9876543210", services: ["maid"], community: "phf" };
const bank = { holder: "Asha", account: "123456789", confirmation: "123456789", ifsc: "HDFC0001234", bankName: "HDFC" };
const ok = (bdp: boolean) => ({ data: { ok: true, worker_id: "w1", approval_status: "pending_approval", bank_details_provided: bdp }, error: null });

describe("optional signup bank", () => {
  it("allows all five fields empty", () => {
    expect(validateOptionalSignupBank({ holder: "", account: "", confirmation: "", ifsc: "", bankName: "" })).toBeNull();
  });
  it("requires all fields once any is entered", () => {
    expect(validateOptionalSignupBank({ holder: "Asha", account: "", confirmation: "", ifsc: "", bankName: "" })).not.toBeNull();
  });
  it("skipped registration sends nulls and reads bank_details_provided=false", async () => {
    const call = vi.fn().mockResolvedValue(ok(false));
    const r = await registerWorkerV2({ ...base, bank: null }, call);
    const args = call.mock.calls[0][1];
    for (const k of ["p_account_holder", "p_account_number", "p_confirm_account_number", "p_ifsc", "p_bank_name"]) expect(args[k]).toBeNull();
    expect(r).toMatchObject({ ok: true, bankDetailsProvided: false });
  });
  it("registration with bank sends values and reads bank_details_provided=true", async () => {
    const call = vi.fn().mockResolvedValue(ok(true));
    const r = await registerWorkerV2({ ...base, bank }, call);
    expect(call.mock.calls[0][1].p_account_number).toBe("123456789");
    expect(r).toMatchObject({ ok: true, bankDetailsProvided: true });
  });
  it("missing flag is treated as not provided", () => {
    expect(parseRegistrationResponse({ ok: true, worker_id: "w1" })).toMatchObject({ bankDetailsProvided: false });
  });
});
