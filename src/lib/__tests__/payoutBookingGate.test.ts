import { describe, it, expect } from "vitest";
import { payoutAllowsBookings } from "@/lib/payoutBookingGate";

describe("bookings require payout details ready (owner 2026-11-26)", () => {
  it("allows bookings only when the server says payout_ready is true", () => {
    expect(payoutAllowsBookings(true)).toBe(true);
  });
  it("blocks bookings when payout_ready is false, missing or unknown", () => {
    for (const v of [false, null, undefined, "true", 1]) expect(payoutAllowsBookings(v)).toBe(false);
  });
});
