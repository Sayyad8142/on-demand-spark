import { describe, it, expect, beforeEach } from "vitest";
import {
  activityBucket, deviceReach, networkState, sessionEnd, slotState, istClock,
  offerDiagnosis, isNotificationProblem, selfHelp, allChecksKnownAndOk,
  makeEvent, enqueue, acceptsUpdate, shouldSendSnapshot, NOTIFICATIONS_DISABLED_MESSAGE, DEVICE_UNREACHABLE_LABEL,
} from "../workerDiagnostics";
import { recordDiagnostic, pendingDiagnostics, flushDiagnostics, clearDiagnostics } from "../diagnosticsSync";

const NOW = Date.parse("2026-10-22T06:00:00Z"); // 11:30 IST, Thursday
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;

describe("1. online and connected", () => {
  it("recent server contact is online + connected", () => {
    expect(networkState({ browserOnline: true, lastServerOkAt: ago(MIN), now: NOW })).toBe("online");
    expect(deviceReach(ago(5 * MIN), NOW)).toBe("connected");
    expect(activityBucket(ago(5 * MIN), NOW)).toBe("active_15m");
  });
});

describe("2/3. internet lost and restored", () => {
  beforeEach(() => clearDiagnostics());
  it("offline phone is never reported online", () => {
    expect(networkState({ browserOnline: false, lastServerOkAt: ago(MIN), now: NOW })).toBe("no_internet");
  });
  it("events saved locally while offline, sent on restore, removed only when confirmed", async () => {
    recordDiagnostic("network_lost", {}, NOW);
    recordDiagnostic("network_restored", {}, NOW + 60_000);
    expect(pendingDiagnostics()).toHaveLength(2);
    expect(await flushDiagnostics(null)).toBe(0);
    expect(pendingDiagnostics()).toHaveLength(2);
    const first = pendingDiagnostics()[0].id;
    expect(await flushDiagnostics(async () => ({ acceptedIds: [first] }))).toBe(1);
    expect(pendingDiagnostics()).toHaveLength(1);
    expect(await flushDiagnostics(async () => { throw new Error("down"); })).toBe(0);
    expect(pendingDiagnostics()).toHaveLength(1);
  });
});

describe("4. notifications disabled", () => {
  it("shows the exact message and settings action", () => {
    const h = selfHelp({ network: "online", permission: "denied", tokenRegistered: true, session: "none", slots: "current_selected" });
    expect(h[0].message).toBe(NOTIFICATIONS_DISABLED_MESSAGE);
    expect(h[0].action).toBe("open_notification_settings");
  });
});

describe("5. missing push token", () => {
  it("offers retry registration and counts as notification problem", () => {
    const h = selfHelp({ network: "online", permission: "granted", tokenRegistered: false, session: "none", slots: "current_selected" });
    expect(h.map((x) => x.action)).toEqual(["retry_registration"]);
    expect(isNotificationProblem({ permission: "granted", tokenRegistered: false, offer: "no_offers_sent" })).toBe(true);
  });
});

describe("6. explicit logout vs expired session", () => {
  it("only an explicit logout is a confirmed logout", () => {
    expect(sessionEnd({ explicitLogout: true, hasSession: false })).toBe("explicit_logout");
    expect(sessionEnd({ explicitLogout: false, hasSession: false })).toBe("session_expired");
    expect(sessionEnd({ explicitLogout: false, hasSession: true })).toBe("none");
  });
});

describe("7. inactive 2 or 3 days", () => {
  it("buckets by real last connection", () => {
    expect(activityBucket(ago(30 * MIN), NOW)).toBe("active_1h");
    expect(activityBucket(ago(DAY + HOUR), NOW)).toBe("inactive_1d");
    expect(activityBucket(ago(2 * DAY + HOUR), NOW)).toBe("inactive_2d");
    expect(activityBucket(ago(3 * DAY + HOUR), NOW)).toBe("inactive_3d");
    expect(activityBucket(ago(8 * DAY), NOW)).toBe("inactive_7d");
    expect(activityBucket(null, NOW)).toBe("unknown");
  });
});

describe("8. ON but disconnected", () => {
  it("never claims switched off — unreachable, reason unknown", () => {
    expect(deviceReach(ago(2 * HOUR), NOW)).toBe("last_seen");
    expect(deviceReach(ago(7 * HOUR), NOW)).toBe("unreachable_unknown");
    expect(DEVICE_UNREACHABLE_LABEL).toBe("Device unreachable — reason unknown");
  });
});

describe("9. busy / slots", () => {
  it("IST clock is independent of device timezone", () => {
    expect(istClock(NOW)).toEqual({ day: 4, minutes: 11 * 60 + 30 });
  });
  it("current slot selected / not selected / none / invalid", () => {
    expect(slotState([{ day_of_week: 4, slots: ["11:30:00"] }], NOW)).toBe("current_selected");
    expect(slotState([{ day_of_week: 4, slots: ["07:00:00"] }], NOW)).toBe("current_not_selected");
    expect(slotState([{ day_of_week: 5, slots: ["11:30:00"] }], NOW)).toBe("current_not_selected");
    expect(slotState([], NOW)).toBe("none_configured");
    expect(slotState([{ day_of_week: 4, slots: ["11:15"] }], NOW)).toBe("invalid");
    expect(slotState(null, NOW)).toBe("unknown");
    expect(slotState([{ day_of_week: 4, slots: ["07:00:00"] }], Date.parse("2026-10-22T16:00:00Z"))).toBe("outside_hours");
  });
});

describe("10/11. offer sent vs not sent", () => {
  it("no offer sent is not a notification problem", () => {
    const d = offerDiagnosis({ sent: 0, received: 0, popupShown: 0, evidenceAvailable: true });
    expect(d).toBe("no_offers_sent");
    expect(isNotificationProblem({ permission: "granted", tokenRegistered: true, offer: d })).toBe(false);
  });
  it("sent but not confirmed received", () => {
    expect(offerDiagnosis({ sent: 3, received: 0, popupShown: 0, evidenceAvailable: true })).toBe("sent_not_confirmed");
    expect(offerDiagnosis({ sent: 3, received: 2, popupShown: 1, evidenceAvailable: true })).toBe("received_popup_missing");
    expect(offerDiagnosis({ sent: 3, received: 3, popupShown: 3, evidenceAvailable: true })).toBe("delivered");
    expect(offerDiagnosis({ sent: 3, received: 0, popupShown: 0, evidenceAvailable: false })).toBe("unknown");
  });
});

describe("12. delayed or duplicated reports", () => {
  it("duplicates are dropped", () => {
    const e = makeEvent("snapshot", {}, NOW);
    expect(enqueue(enqueue([], e), { ...e })).toHaveLength(1);
  });
  it("older report never overwrites newer status", () => {
    expect(acceptsUpdate(ago(MIN), ago(5 * MIN))).toBe(false);
    expect(acceptsUpdate(ago(5 * MIN), ago(MIN))).toBe(true);
    expect(acceptsUpdate(null, ago(MIN))).toBe(true);
  });
  it("snapshots are throttled to 15 min unless something changed", () => {
    expect(shouldSendSnapshot(NOW - 5 * MIN, NOW)).toBe(false);
    expect(shouldSendSnapshot(NOW - 16 * MIN, NOW)).toBe(true);
    expect(shouldSendSnapshot(NOW - MIN, NOW, true)).toBe(true);
  });
  it("token strings never enter an event", () => {
    const e = makeEvent("push_token_refreshed", { fcm_token: "abc", token_registered: true }, NOW);
    expect(e.data).toEqual({ token_registered: true });
  });
});

describe("self-help never falsely says all working", () => {
  it("unknown checks are not 'all OK'", () => {
    expect(allChecksKnownAndOk({ network: "online", permission: "unknown", tokenRegistered: true, session: "none", slots: "current_selected" })).toBe(false);
    expect(allChecksKnownAndOk({ network: "unknown", permission: "granted", tokenRegistered: true, session: "none", slots: "current_selected" })).toBe(false);
    expect(allChecksKnownAndOk({ network: "online", permission: "granted", tokenRegistered: true, session: "none", slots: "current_selected" })).toBe(true);
  });
});
