import { describe, it, expect } from "vitest";
import { bookingCharges, startOtpCountdown } from "../bookingCardDetails";
import { mergeActiveBooking, workerVisibleBooking } from "../activeBookingCache";

const now = Date.parse("2026-11-12T08:00:00Z");
const pending = { id: "b1", status: "accepted", start_otp_required: true, started_at: null, accepted_at: new Date(now).toISOString() };
describe("booking details", () => {
  it("starts at ten minutes using server acceptance, not page open time", () => {
    expect(startOtpCountdown(pending, now)).toBe(600);
    expect(startOtpCountdown(pending, now + 15_000)).toBe(585);
    expect(startOtpCountdown(pending, now + 599_000)).toBe(1);
  });
  it("zero and overdue remain pending without changing the booking", () => {
    expect(startOtpCountdown(pending, now + 600_000)).toBe(0);
    expect(startOtpCountdown(pending, now + 800_000)).toBe(0);
    expect(pending.status).toBe("accepted");
  });
  it("uses server assignment fallback and never invents missing times", () => {
    expect(startOtpCountdown({ ...pending, accepted_at: null, assigned_at: new Date(now).toISOString() }, now)).toBe(600);
    expect(startOtpCountdown({ ...pending, accepted_at: null }, now)).toBeNull();
  });
  it("no timer after server start/cancel or on unflagged bookings", () => {
    expect(startOtpCountdown({ ...pending, started_at: new Date(now).toISOString() }, now)).toBeNull();
    expect(startOtpCountdown({ ...pending, status: "cancelled" }, now)).toBeNull();
    expect(startOtpCountdown({ ...pending, start_otp_required: false }, now)).toBeNull();
  });
  it("dishes 30 and surge 20 are separate real amounts", () => {
    expect(bookingCharges({ dish_intensity_extra_inr: 30, slot_surge_amount: 20 })).toEqual([
      { kind: "dishes", label: "Extra Dishes", amount: 30 }, { kind: "surge", label: "Surge Charge", amount: 20 },
    ]);
  });
  it("only finite positive applied charges, no guessed extras", () => {
    expect(bookingCharges({ dish_intensity_extra_inr: 0, slot_surge_amount: -20, surcharge_amount: NaN, glass_partition_fee: null })).toEqual([]);
    expect(bookingCharges({ surcharge_amount: 50, surcharge_reason: "Heavy cleaning" })).toEqual([{ kind: "surcharge", label: "Heavy cleaning", amount: 50 }]);
  });
});
describe("active booking cache", () => {
  const row = { id: "b1", worker_id: "w1", status: "accepted", updated_at: "2026-11-12T08:00:00Z" };
  it("accepted server row appears immediately", () => expect(mergeActiveBooking(null, row, "w1")).toEqual(row));
  it("started/in_progress are active; completed and cancelled clear only matching card", () => {
    expect(mergeActiveBooking(row, { ...row, status: "started" }, "w1")?.status).toBe("started");
    expect(mergeActiveBooking(row, { ...row, status: "in_progress" }, "w1")?.status).toBe("in_progress");
    for (const status of ["completed", "cancelled"]) {
      expect(mergeActiveBooking(row, { ...row, status }, "w1")).toBeNull();
      expect(mergeActiveBooking(row, { ...row, id: "old", status }, "w1")).toEqual(row);
    }
  });
  it("old events cannot overwrite newer state", () => expect(mergeActiveBooking(row, { ...row, status: "cancelled", updated_at: "2026-11-12T07:59:00Z" }, "w1")).toEqual(row));
  it("no other worker's booking and no OTP secrets enter cache", () => {
    expect(mergeActiveBooking(null, row, "w2")).toBeNull();
    expect(workerVisibleBooking({ ...row, completion_otp: "123", code_hash: "secret", code_salt: "secret" })).toEqual(row);
  });
});