import { describe, it, expect } from "vitest";
import { parsePayoutReadiness, readinessAllowsBookings } from "@/lib/payoutBookingGate";

describe("bank never restricts work (owner 2026-11-27)", () => {
  it.each([true, false])("missing bank never blocks with Admin enforced=%s", (enforced) => {
    const r = parsePayoutReadiness({ ready: false, has_bank_details: false, beneficiary_registered: false, admin_approved: true, enforced });
    expect(readinessAllowsBookings(r)).toBe(true);
  });
  it("unknown bank status never restricts work", () => expect(readinessAllowsBookings(null)).toBe(true));
});
