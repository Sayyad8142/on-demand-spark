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
  it("scheduled bookings ignore the old acceptance-only rule", () => {
    expect(trustedServerDeadline("2026-11-25T03:40:00Z", { bookingType: "scheduled", ruleVersion: 1 })).toBeNull();
    expect(trustedServerDeadline("2026-11-25T03:40:00Z", { bookingType: "scheduled", ruleVersion: null })).toBeNull();
    expect(startOtpTimer(b, now, "2026-11-25T03:40:00Z", { bookingType: "scheduled", ruleVersion: 1 })).toBeNull();
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

import { startAlarmPhase } from "../startOtpAlarm";
describe("deadline rule v2 (live)", () => {
  const live = (row: Record<string, unknown>) => ({ contract_version: 1, deadline_rule_version: 2, settings: { enabled: false }, history: [],
    bookings: [{ booking_id: "b1", deadline_minutes: 10, deduction_points: 5, penalty_enabled: true, ...row }] });
  it("reads top-level rule version 2", () => {
    expect(parseLateStartStatus(live({ deadline_at: "2026-11-25T03:40:00Z", deadline_basis: "scheduled_start" }), "b1")!.deadline_rule_version).toBe(2);
  });
  it("missing scheduled time: no countdown, no warning, no acceptance fallback", () => {
    const s = parseLateStartStatus(live({ deadline_at: null, deadline_basis: "unmeasurable_missing_schedule" }), "b1")!;
    expect(s.unmeasurable).toBe(true);
    expect(s.settings.enabled).toBe(false);
    expect(startOtpTimer(b, now, s.deadline_at, { bookingType: "scheduled", ruleVersion: 2, unmeasurable: true })).toBeNull();
    expect(startAlarmPhase({ ...b, worker_id: "w" }, "w", now + 3600_000, null)).toBe("stopped");
  });
  it("scheduled booking without a loaded server deadline shows no countdown", () => {
    expect(startOtpTimer(b, now, null, { bookingType: "scheduled", ruleVersion: null })).toBeNull();
  });
  it("scheduled accepted early: silent before start + 10, first at +10, continuous at +15", () => {
    const d = "2026-11-25T03:40:00Z", D = Date.parse(d), w = { ...b, worker_id: "w" };
    expect(startAlarmPhase(w, "w", D - 1000, d)).toBe("waiting");
    expect(startAlarmPhase(w, "w", D, d)).toBe("first");
    expect(startAlarmPhase(w, "w", D + 5 * 60_000, d)).toBe("continuous");
  });
  it("scheduled accepted late uses the later acceptance-based server deadline", () => {
    const t = startOtpTimer({ ...b, accepted_at: "2026-11-25T03:55:00Z" }, Date.parse("2026-11-25T04:00:00Z"), "2026-11-25T04:05:00Z", { bookingType: "scheduled", ruleVersion: 2 })!;
    expect(t.seconds).toBe(300);
  });
});
