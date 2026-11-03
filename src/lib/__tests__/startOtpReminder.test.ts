import { describe, it, expect } from "vitest";
import {
  adminFlagLevel, cardIndicator, diffReminders, isReminderEligible,
  planReminders, reminderNotificationId, reminderOffsetsMin,
} from "@/lib/startOtpReminder";

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 4, 6, 0, 0);
const base = {
  id: "b-1", status: "accepted", worker_id: "w-1", start_otp_required: true,
  started_at: null, accepted_at: new Date(T0).toISOString(),
};

describe("start OTP reminder schedule", () => {
  it("first at 10 min, every 5 min, last at 120 min", () => {
    const o = reminderOffsetsMin();
    expect(o[0]).toBe(10);
    expect(o[1]).toBe(15);
    expect(o[o.length - 1]).toBe(120);
    expect(o.length).toBe(23);
  });
  it("plans all 23 right after acceptance", () => {
    const p = planReminders(base, "w-1", T0);
    expect(p.length).toBe(23);
    expect(p[0].at).toBe(T0 + 10 * MIN);
  });
  it("skips past reminders after reopening at 32 min", () => {
    const p = planReminders(base, "w-1", T0 + 32 * MIN);
    expect(p[0].at).toBe(T0 + 35 * MIN);
  });
  it("nothing after 2 hours", () => {
    expect(planReminders(base, "w-1", T0 + 121 * MIN)).toEqual([]);
  });
});

describe("stop conditions", () => {
  it("server started_at stops reminders", () => {
    expect(planReminders({ ...base, started_at: new Date(T0).toISOString() }, "w-1", T0)).toEqual([]);
  });
  it("cancelled / completed stop", () => {
    expect(isReminderEligible({ ...base, status: "cancelled" }, "w-1")).toBe(false);
    expect(isReminderEligible({ ...base, status: "completed" }, "w-1")).toBe(false);
  });
  it("reassigned to another worker stops", () => {
    expect(isReminderEligible({ ...base, worker_id: "w-2" }, "w-1")).toBe(false);
  });
  it("bookings without Start OTP never remind", () => {
    expect(isReminderEligible({ ...base, start_otp_required: false }, "w-1")).toBe(false);
  });
});

describe("dedupe", () => {
  it("ids are stable and unique per booking", () => {
    expect(reminderNotificationId("b-1", 0)).toBe(reminderNotificationId("b-1", 0));
    expect(reminderNotificationId("b-1", 0)).not.toBe(reminderNotificationId("b-1", 1));
    expect(reminderNotificationId("b-1", 0)).toBeLessThan(2 ** 31);
  });
  it("re-sync schedules nothing already pending and cancels stale", () => {
    const wanted = planReminders(base, "w-1", T0);
    const d = diffReminders([...wanted.map((w) => w.id), 42], wanted);
    expect(d.schedule).toEqual([]);
    expect(d.cancel).toEqual([42]);
  });
});

describe("indicator and admin flag", () => {
  it("pending before 10 min, delayed after", () => {
    expect(cardIndicator(base, T0 + 9 * MIN)).toBe("pending");
    expect(cardIndicator(base, T0 + 10 * MIN)).toBe("delayed");
  });
  it("admin follow-up at 20 min, urgent at 2 h", () => {
    expect(adminFlagLevel(base, T0 + 19 * MIN)).toBe("none");
    expect(adminFlagLevel(base, T0 + 20 * MIN)).toBe("follow_up");
    expect(adminFlagLevel(base, T0 + 120 * MIN)).toBe("urgent");
  });
});
