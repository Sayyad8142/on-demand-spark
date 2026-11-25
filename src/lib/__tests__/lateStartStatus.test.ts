import { describe, expect, it } from "vitest";
import { lateStartNotice, parseLateStartStatus } from "../lateStartPriority";
import { startOtpTimer } from "../bookingCardDetails";

// Shape returned by the live get_my_late_start_status (contract_version 1).
const live = (over: Record<string, unknown> = {}, booking: Record<string, unknown> = {}) => ({
  contract_version: 1, worker_id: "w", server_now: "2026-11-25T10:00:00Z", active_penalty_points: 0, priority_score: 61,
  settings: { enabled: false, deadline_minutes: 10, deduction_points: 5, retention_days: 7, settings_id: "s" },
  bookings: [{ booking_id: "b1", accepted_at: "2026-11-25T09:55:00Z", deadline_at: "2026-11-25T10:05:00Z", deadline_minutes: 10, deduction_points: 5, penalty_enabled: false, verified_at: null, exempted: false, ...booking }],
  history: [], ...over,
});
const booking = { id: "b1", status: "accepted", start_otp_required: true, started_at: null, accepted_at: "2026-11-25T09:55:00Z" };

describe("Late Start status (server deadline, no local deduction)", () => {
  it("reads the server deadline and keeps deductions off while Admin has them disabled", () => {
    const s = parseLateStartStatus(live(), "b1")!;
    expect(s.deadline_at).toBe("2026-11-25T10:05:00Z");
    expect(s.settings).toEqual({ enabled: false, points: 5 });
    expect(lateStartNotice(s, false)).toBeNull();
    expect(lateStartNotice(s, true)).toBeNull();
  });
  it("instant booking: countdown ends at acceptance + 10 min, same as the alarm anchor", () => {
    const s = parseLateStartStatus(live(), "b1")!;
    const t = startOtpTimer(booking, Date.parse("2026-11-25T10:00:00Z"), s.deadline_at)!;
    expect(t.seconds).toBe(300);
    expect(startOtpTimer(booking, Date.parse("2026-11-25T10:00:00Z"))!.seconds).toBe(300);
  });
  it("scheduled booking: countdown follows the server's later deadline, never a local guess", () => {
    const s = parseLateStartStatus(live({}, { deadline_at: "2026-11-25T14:10:00Z" }), "b1")!;
    const t = startOtpTimer(booking, Date.parse("2026-11-25T14:05:00Z"), s.deadline_at)!;
    expect(t).toMatchObject({ overdue: false, seconds: 300 });
  });
  it("overdue counts from the server deadline", () => {
    expect(startOtpTimer(booking, Date.parse("2026-11-25T10:06:15Z"), "2026-11-25T10:05:00Z")).toMatchObject({ overdue: true, seconds: 75 });
  });
  it("a penalty is shown only when the server history records it", () => {
    const on = live({ settings: { enabled: true, deadline_minutes: 10, deduction_points: 5 } }, { penalty_enabled: true });
    expect(lateStartNotice(parseLateStartStatus(on, "b1"), true)).toBeNull();
    const withHistory = { ...on, history: [{ id: 1, booking_id: "b1", event_type: "penalty", points_change: -5, created_at: "2026-11-25T10:05:30Z", reversed: false }] };
    expect(lateStartNotice(parseLateStartStatus(withHistory, "b1"), true)).toEqual({ kind: "confirmed", points: 5 });
    const reversed = { ...withHistory, history: [{ ...withHistory.history[0], reversed: true }] };
    expect(parseLateStartStatus(reversed, "b1")!.penalty).toBeNull();
  });
  it("exempted bookings never warn", () => {
    const s = parseLateStartStatus(live({ settings: { enabled: true } }, { penalty_enabled: true, exempted: true }), "b1")!;
    expect(s.settings.enabled).toBe(false);
  });
  it("unavailable, malformed or other-booking responses → null (existing timer keeps running)", () => {
    for (const x of [null, {}, live({ contract_version: 3 }), live({ bookings: null }), live({}, { deadline_at: "nope" })]) expect(parseLateStartStatus(x, "b1")).toBeNull();
    expect(parseLateStartStatus(live(), "other")).toBeNull();
    expect(startOtpTimer(booking, Date.parse("2026-11-25T10:00:00Z"), null)!.seconds).toBe(300);
  });
});
