import { describe, it, expect } from "vitest";
import { decideUpdate, policyFromConfig, makeSnooze, WORKER_PLAY_STORE_URL, SOFT_SNOOZE_MS, type UpdatePolicy } from "../updateDecision";

const now = 1_000_000;
const p = (o: Partial<UpdatePolicy> = {}): UpdatePolicy => ({ minBuild: null, latestBuild: null, latestName: null, hardEnabled: false, softEnabled: false, ...o });

describe("updateDecision", () => {
  it("store link uses verified package app.didisnow.worker", () => {
    expect(WORKER_PLAY_STORE_URL).toBe("https://play.google.com/store/apps/details?id=app.didisnow.worker");
  });
  it("force only below minimum build", () => {
    expect(decideUpdate({ installedBuild: 101, policy: p({ hardEnabled: true, minBuild: 102 }), now })).toBe("force");
    expect(decideUpdate({ installedBuild: 102, policy: p({ hardEnabled: true, minBuild: 102 }), now })).toBe("none");
  });
  it("force requires hard switch on", () => {
    expect(decideUpdate({ installedBuild: 1, policy: p({ minBuild: 102 }), now })).toBe("none");
  });
  it("compares numerically (99 < 102, not string order)", () => {
    expect(decideUpdate({ installedBuild: 99, policy: p({ hardEnabled: true, minBuild: 102 }), now })).toBe("force");
  });
  it("force deferred during accepted / ongoing booking", () => {
    for (const s of ["accepted", "on_the_way", "started", "in_progress", "assigned"])
      expect(decideUpdate({ installedBuild: 100, policy: p({ hardEnabled: true, minBuild: 102 }), activeBookingStatus: s, now })).toBe("force_deferred");
    expect(decideUpdate({ installedBuild: 100, policy: p({ hardEnabled: true, minBuild: 102 }), activeBookingStatus: "completed", now })).toBe("force");
  });
  it("soft only when below latest build and enabled", () => {
    expect(decideUpdate({ installedBuild: 102, policy: p({ softEnabled: true, latestBuild: 103 }), now })).toBe("soft");
    expect(decideUpdate({ installedBuild: 103, policy: p({ softEnabled: true, latestBuild: 103 }), now })).toBe("none");
    expect(decideUpdate({ installedBuild: 102, policy: p({ latestBuild: 103 }), now })).toBe("none");
  });
  it("soft never shows without a numeric latest build", () => {
    expect(decideUpdate({ installedBuild: 102, policy: policyFromConfig({ worker_soft_update_enabled: true, latest_worker_version_name: "99.0" }), now })).toBe("none");
  });
  it("Later hides soft until a newer build or 3 days", () => {
    const snooze = makeSnooze(103, now);
    const pol = p({ softEnabled: true, latestBuild: 103 });
    expect(decideUpdate({ installedBuild: 102, policy: pol, snooze, now: now + 1000 })).toBe("none");
    expect(decideUpdate({ installedBuild: 102, policy: pol, snooze, now: now + SOFT_SNOOZE_MS + 1 })).toBe("soft");
    expect(decideUpdate({ installedBuild: 102, policy: p({ softEnabled: true, latestBuild: 104 }), snooze, now: now + 1000 })).toBe("soft");
  });
  it("soft hidden during active booking", () => {
    expect(decideUpdate({ installedBuild: 102, policy: p({ softEnabled: true, latestBuild: 103 }), activeBookingStatus: "started", now })).toBe("none");
  });
  it("legacy shared flags and store URLs are ignored", () => {
    const pol = policyFromConfig({ soft_update_enabled: true, force_update: true, min_worker_version_code: 500, play_store_url_worker: "https://x" });
    expect(decideUpdate({ installedBuild: 102, policy: pol, now })).toBe("none");
  });
  it("current production row produces no prompt", () => {
    const pol = policyFromConfig({ min_worker_version_code: 1, worker_hard_update_enabled: false, worker_soft_update_enabled: false });
    expect(decideUpdate({ installedBuild: 102, policy: pol, now })).toBe("none");
  });
});
