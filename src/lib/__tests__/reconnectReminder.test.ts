import { describe, it, expect } from "vitest";
import {
  RECONNECT_REMINDER_ENABLED, decideReconnectReminder, isInReminderWindow, isVerifiedAppOpen,
  shouldRecordVerifiedOpen, shouldShowReconnectScreen, type ReminderInput,
} from "../reconnectReminder";

// 12:00 IST = 06:30 UTC
const noonIst = new Date("2026-11-10T06:30:00Z");
const base: ReminderInput = {
  now: noonIst, isGuest: false,
  lastVerifiedOpenAt: "2026-11-06T06:00:00Z", // ~96h ago
  lastReminderAt: null, rolloutAt: "2026-11-01T00:00:00Z",
  pausedByWorker: false, pausedByAdmin: false, hasSlotsNext7Days: true,
  fcmTokenStatus: "active", hasFcmToken: true,
};

describe("reconnect reminder rules", () => {
  it("switch is OFF in Step 1", () => expect(RECONNECT_REMINDER_ENABLED).toBe(false));
  it("72h+ without open, in window → send", () => expect(decideReconnectReminder(base).action).toBe("send_reminder"));
  it("opened 71h ago → none", () => {
    expect(decideReconnectReminder({ ...base, lastVerifiedOpenAt: "2026-11-07T07:30:00Z" })).toEqual({ action: "none", reason: "recently_opened" });
  });
  it("window 10 AM–6 PM IST", () => {
    expect(isInReminderWindow(new Date("2026-11-10T04:29:00Z"))).toBe(false); // 9:59 IST
    expect(isInReminderWindow(new Date("2026-11-10T04:30:00Z"))).toBe(true); // 10:00 IST
    expect(isInReminderWindow(new Date("2026-11-10T12:29:00Z"))).toBe(true); // 17:59 IST
    expect(isInReminderWindow(new Date("2026-11-10T12:30:00Z"))).toBe(false); // 18:00 IST
    expect(decideReconnectReminder({ ...base, now: new Date("2026-11-10T14:00:00Z") }).action).toBe("none");
  });
  it("max once per 72h", () => {
    expect(decideReconnectReminder({ ...base, lastReminderAt: "2026-11-08T06:30:00Z" })).toEqual({ action: "none", reason: "frequency_cap" });
    expect(decideReconnectReminder({ ...base, lastReminderAt: "2026-11-07T06:30:00Z" }).action).toBe("send_reminder");
  });
  it("no slots next 7 days → skip", () => expect(decideReconnectReminder({ ...base, hasSlotsNext7Days: false }).action).toBe("none"));
  it("worker pause and admin pause both stop it", () => {
    expect(decideReconnectReminder({ ...base, pausedByWorker: true }).action).toBe("none");
    expect(decideReconnectReminder({ ...base, pausedByAdmin: true }).action).toBe("none");
  });
  it("missing / invalid token → admin follow-up, not a push", () => {
    expect(decideReconnectReminder({ ...base, hasFcmToken: false })).toEqual({ action: "admin_followup", reason: "missing_fcm_token" });
    expect(decideReconnectReminder({ ...base, fcmTokenStatus: "invalid" })).toEqual({ action: "admin_followup", reason: "invalid_fcm_token" });
  });
  it("no reminder within 72h of rollout, even if never opened", () => {
    expect(decideReconnectReminder({ ...base, lastVerifiedOpenAt: null, rolloutAt: "2026-11-08T00:00:00Z" }).action).toBe("none");
  });
  it("only real foreground counts as an open", () => {
    expect(isVerifiedAppOpen({ appActive: true, documentVisible: true, source: "app_state_active" })).toBe(true);
    expect(isVerifiedAppOpen({ appActive: true, documentVisible: false, source: "app_state_active" })).toBe(false);
    for (const s of ["heartbeat", "fcm", "boot", "token_sync"]) {
      expect(isVerifiedAppOpen({ appActive: true, documentVisible: true, source: s })).toBe(false);
    }
  });
  it("open recording debounced 10 min", () => {
    expect(shouldRecordVerifiedOpen(null, 0)).toBe(true);
    expect(shouldRecordVerifiedOpen(0, 9 * 60_000)).toBe(false);
    expect(shouldRecordVerifiedOpen(0, 10 * 60_000)).toBe(true);
  });
  it("red screen hidden when switch off", () => {
    expect(shouldShowReconnectScreen({ enabled: false, isGuest: false, fromReminder: true })).toBe(false);
    expect(shouldShowReconnectScreen({ enabled: true, isGuest: false, fromReminder: true })).toBe(true);
  });
});
