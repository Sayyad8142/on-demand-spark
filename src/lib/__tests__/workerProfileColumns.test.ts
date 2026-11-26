import { describe, it, expect } from "vitest";
import { WORKER_PROFILE_FIELDS, WORKER_PAYOUT_DETAIL_FIELDS, sanitizeWorkerUpdate } from "@/lib/workerProfileColumns";

describe("worker profile columns", () => {
  it("shared profile never loads FCM tokens, bank or provider fields", () => {
    const banned = ["fcm_token", "bank_account_number", "ifsc_code", "account_holder_name", "bank_name", "passbook_url"];
    for (const b of banned) expect(WORKER_PROFILE_FIELDS as readonly string[]).not.toContain(b);
    expect(WORKER_PROFILE_FIELDS.some((f) => /cashfree|razorpay/.test(f))).toBe(false);
  });
  it("payout details screen never loads the FCM token", () => {
    expect(WORKER_PAYOUT_DETAIL_FIELDS as readonly string[]).not.toContain("fcm_token");
  });
  it("profile updates never carry user_id or id", () => {
    const out = sanitizeWorkerUpdate({ user_id: "x", id: "y", full_name: "A" });
    expect(out).toEqual({ full_name: "A" });
  });
});
