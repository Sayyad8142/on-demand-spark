import { describe, expect, it } from "vitest";
import { completionReminderAllowed, startAlarmPhase } from "../startOtpAlarm";

const accepted = Date.parse("2026-11-15T04:00:00Z");
const b = { id: "booking", worker_id: "worker", status: "accepted", start_otp_required: true, started_at: null, accepted_at: new Date(accepted).toISOString() };
describe("native Start OTP alarm contract", () => {
  it("first clip begins at 10 minutes", () => {
    expect(startAlarmPhase(b, "worker", accepted + 599999)).toBe("waiting");
    expect(startAlarmPhase(b, "worker", accepted + 600000)).toBe("first");
  });
  it("second clip begins at 15 minutes", () => expect(startAlarmPhase(b, "worker", accepted + 900000)).toBe("second"));
  it("continuous begins at 20 minutes", () => expect(startAlarmPhase(b, "worker", accepted + 1200000)).toBe("continuous"));
  it("continuous has no 2-hour cutoff", () => expect(startAlarmPhase(b, "worker", accepted + 8 * 3600000)).toBe("continuous"));
  it("server verified Start stops", () => expect(startAlarmPhase({ ...b, started_at: new Date(accepted).toISOString() }, "worker", accepted + 1200000)).toBe("stopped"));
  it("wrong code with unchanged server state never stops", () => expect(startAlarmPhase(b, "worker", accepted + 1200000)).toBe("continuous"));
  for (const status of ["cancelled", "completed", "expired", "closed"]) {
    it(`${status} stops`, () => expect(startAlarmPhase({ ...b, status }, "worker", accepted + 1200000)).toBe("stopped"));
  }
  it("reassignment stops", () => expect(startAlarmPhase({ ...b, worker_id: "other" }, "worker", accepted + 1200000)).toBe("stopped"));
  it("logout stops", () => expect(startAlarmPhase(b, null, accepted + 1200000)).toBe("stopped"));
  it("assignment alone does not start the acceptance timer", () => expect(startAlarmPhase({ ...b, accepted_at: null, assigned_at: b.accepted_at }, "worker", accepted + 1200000)).toBe("stopped"));
  it("completion voice yields until server Start is verified", () => {
    expect(completionReminderAllowed(true, null)).toBe(false);
    expect(completionReminderAllowed(true, b.accepted_at)).toBe(true);
    expect(completionReminderAllowed(false, null)).toBe(true);
  });
});