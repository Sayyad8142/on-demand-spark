import { describe, it, expect } from "vitest";
import { connectionState, watchdogDecision, dispatchExclusions, statusSummary, CONNECTION_STALE_MIN } from "@/lib/workerReachability";

const NOW = Date.parse("2026-10-22T06:00:00Z");
const minAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

describe("connection is separate from availability", () => {
  it("a 20-minute heartbeat gap is still connected", () => {
    expect(connectionState(minAgo(20), NOW)).toBe("connected");
  });
  it("stale only after 45 minutes", () => {
    expect(CONNECTION_STALE_MIN).toBe(45);
    expect(connectionState(minAgo(46), NOW)).toBe("stale");
  });
  it("no heartbeat is unknown, not offline", () => {
    expect(connectionState(null, NOW)).toBe("unknown");
  });
});

describe("watchdog rule", () => {
  const base = { isAvailable: true, hasToken: true, tokenInvalid: false, autoPausedSource: null, lastAvailabilitySource: "worker" };
  it("never switches OFF for a missing heartbeat", () => {
    expect(watchdogDecision(base)).toBe("none");
  });
  it("pauses an ON worker with no push token", () => {
    expect(watchdogDecision({ ...base, hasToken: false })).toBe("pause_no_token");
  });
  it("never switches ON a worker who turned herself OFF", () => {
    expect(watchdogDecision({ ...base, isAvailable: false, lastAvailabilitySource: "worker" })).toBe("none");
  });
  it("never undoes its pause if the worker changed availability since", () => {
    expect(watchdogDecision({ ...base, isAvailable: false, autoPausedSource: "watchdog", lastAvailabilitySource: "worker" })).toBe("none");
  });
  it("restores its own pause once the token is back", () => {
    expect(watchdogDecision({ ...base, isAvailable: false, autoPausedSource: "watchdog", lastAvailabilitySource: "system_auto_offline" })).toBe("restore_own_pause");
  });
});

describe("dispatch eligibility", () => {
  const ok = { isActive: true, isAvailable: true, isBusy: false, isBlocked: false, payoutReady: true, servesService: true, inCommunity: true, hasSlot: true, hasToken: true, tokenInvalid: false, notificationPermission: true };
  it("declined popup permission does not exclude", () => {
    expect(dispatchExclusions({ ...ok, overlayPermission: false })).toEqual([]);
  });
  it("missing token excludes with reason", () => {
    expect(dispatchExclusions({ ...ok, hasToken: false })).toEqual(["no_push_token"]);
  });
  it("busy worker is excluded (no overlapping bookings)", () => {
    expect(dispatchExclusions({ ...ok, isBusy: true })).toContain("busy");
  });
  it("notifications denied excludes", () => {
    expect(dispatchExclusions({ ...ok, notificationPermission: false })).toContain("notifications_denied");
  });
});

describe("worker status summary", () => {
  const ok = { isAvailable: true, isBusy: false, isBlocked: false, payoutReady: true, online: true, native: true, permissionGranted: true, channelOk: true, tokenRegistered: true, lastHeartbeatAt: minAgo(1), now: NOW };
  it("ready when everything checks out", () => {
    const s = statusSummary(ok);
    expect(s.alerts).toBe("ready");
    expect(s.eligibility).toBe("eligible");
  });
  it("missing token needs attention with a clear message", () => {
    const s = statusSummary({ ...ok, tokenRegistered: false });
    expect(s.alerts).toBe("attention");
    expect(s.eligibility).toBe("not_eligible");
    expect(s.messages).toContain("Booking alerts need to be registered. Open the app with internet access.");
  });
  it("unchecked token is unknown, never ready", () => {
    expect(statusSummary({ ...ok, tokenRegistered: null }).alerts).toBe("unknown");
  });
  it("ON but stale connection keeps availability ON", () => {
    const s = statusSummary({ ...ok, lastHeartbeatAt: minAgo(120) });
    expect(s.availability).toBe("on");
    expect(s.connection).toBe("stale");
  });
  it("notifications denied", () => {
    expect(statusSummary({ ...ok, permissionGranted: false }).messages[0]).toBe("Booking alerts are disabled. Please enable notifications to receive new bookings.");
  });
});
