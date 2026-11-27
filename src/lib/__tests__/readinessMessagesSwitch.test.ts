import { describe, expect, it } from "vitest";
import { readinessMessages } from "@/components/payouts/PayoutReadinessNotice";
import { parsePayoutReadiness } from "@/lib/payoutBookingGate";

const r = (o: Record<string, unknown>) => parsePayoutReadiness({ worker_id: "w", has_bank_details: true, beneficiary_registered: true, admin_approved: true, ready: true, missing: [], enforced: false, ...o });

describe("bank messages follow the Admin switch", () => {
  it("switch off and still getting bookings: never says bookings are blocked", () => {
    const msgs = readinessMessages(r({ ready: false, has_bank_details: false, admin_approved: false }), true);
    expect(msgs).toEqual(["Add your bank account so Didi Now can pay you."]);
    expect(readinessMessages(r({ ready: false, beneficiary_registered: false }), true)).toEqual([]);
  });
  it("bank reminder stays neutral even if Admin's bank switch is on", () => {
    expect(readinessMessages(r({ ready: false, has_bank_details: false, admin_approved: false, enforced: true }), false))
      .toEqual(["Add your bank account so Didi Now can pay you."]);
  });
});
