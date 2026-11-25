import { describe, expect, it } from "vitest";
import { alarmPhaseFromDeadline, startOtpTimer, trustedServerDeadline } from "../bookingCardDetails";
import { parseLateStartStatus } from "../lateStartPriority";

const accepted = "2026-11-25T03:00:00Z";
const b = { id: "b1", status: "accepted", start_otp_required: true, started_at: null, accepted_at: accepted };
const now = Date.parse("2026-11-25T03:05:00Z");

describe("Start deadline rule", () => {
  it("instant bookings use the server deadline", () => {
    expect(trustedServerDeadline("2026-11-25T03:10:00Z", { bookingType: "instant", ruleVersion: 1 })).toBe("2026-11-25T03:10:00Z");
  });
  it("scheduled bookings ignore the old acceptance-only rule and keep existing behaviour", () => {
    expect(trustedServerDeadline("2026-11-25T03:40:00Z", { bookingType: "scheduled", ruleVersion: 1 })).toBeNull();
    expect(trustedServerDeadline("2026-11-25T03:40:00Z", { bookingType: "scheduled", ruleVersion: null })).toBeNull();
    expect(startOtpTimer(b, now, "2026-11-25T03:40:00Z", { bookingType: "scheduled", ruleVersion: 1 })!.seconds).toBe(300);
  });
  it("scheduled bookings use the corrected server deadline once rule version 2 arrives", () => {
    const t = startOtpTimer(b, now, "2026-11-25T03:40:00Z", { bookingType: "scheduled", ruleVersion: 2 })!;
    expect(t.overdue).toBe(false);
    expect(t.seconds).toBe(600); // capped display window; no countdown before start window
  });
  it("milestones: first at deadline, second +5 min, continuous from +10 min", () => {
    const d = Date.parse("2026-11-25T03:40:00Z");
    expect(alarmPhaseFromDeadline(d, d - 1)).toBe("waiting");
    expect(alarmPhaseFromDeadline(d, d)).toBe("first");
    expect(alarmPhaseFromDeadline(d, d + 5 * 60_000)).toBe("second");
    expect(alarmPhaseFromDeadline(d, d + 10 * 60_000)).toBe("continuous");
  });
  it("reads deadline_rule_version from the server, missing → null", () => {
    const row = { booking_id: "b1", deadline_at: "2026-11-25T03:10:00Z", deadline_minutes: 10, deduction_points: 5, penalty_enabled: false };
    const r = { contract_version: 1, settings: { enabled: false }, bookings: [row], history: [] };
    expect(parseLateStartStatus(r, "b1")!.deadline_rule_version).toBeNull();
    expect(parseLateStartStatus({ ...r, contract_version: 2, bookings: [{ ...row, deadline_rule_version: 2 }] }, "b1")!.deadline_rule_version).toBe(2);
  });
});
