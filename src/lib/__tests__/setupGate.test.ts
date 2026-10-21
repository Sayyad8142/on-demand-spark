import { describe, it, expect } from "vitest";
import {
  notificationAction, isSetupBlocking, shouldShowBatteryPrompt, snoozeBattery,
  clearAccountSetupState, shouldRequestActivity, singleFlight, BATTERY_SNOOZE_MS, type KVStore,
} from "../setupGate";

const mem = (): KVStore => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
};

describe("notifications", () => {
  it("denied notifications keep the setup screen", () => {
    expect(isSetupBlocking({ notifications: "missing", overlay: "granted" })).toBe(true);
    expect(isSetupBlocking({ notifications: "denied", overlay: "granted" })).toBe(true);
  });
  it("setup clears only when both are granted", () => {
    expect(isSetupBlocking({ notifications: "granted", overlay: "granted" })).toBe(false);
  });
  it("permanently blocked opens Settings instead of re-requesting", () => {
    expect(notificationAction("denied")).toBe("open_settings");
    expect(notificationAction("missing")).toBe("request");
  });
  it("return from Settings with permission on needs no action", () => {
    expect(notificationAction("granted")).toBe("none");
  });
});

describe("battery Later", () => {
  it("Later hides the prompt for 24h for that account only", () => {
    const s = mem(); const now = 1_000_000;
    snoozeBattery(s, "a", now);
    expect(shouldShowBatteryPrompt({ missing: true, userId: "a", store: s, now: now + 1000 })).toBe(false);
    expect(shouldShowBatteryPrompt({ missing: true, userId: "b", store: s, now })).toBe(true);
    expect(shouldShowBatteryPrompt({ missing: true, userId: "a", store: s, now: now + BATTERY_SNOOZE_MS + 1 })).toBe(true);
  });
  it("never shows when battery is already allowed", () => {
    expect(shouldShowBatteryPrompt({ missing: false, userId: "a", store: mem() })).toBe(false);
  });
  it("account switch clears the signed-out account's snooze", () => {
    const s = mem(); snoozeBattery(s, "a", 0);
    clearAccountSetupState(s, "a");
    expect(shouldShowBatteryPrompt({ missing: true, userId: "a", store: s, now: 1 })).toBe(true);
  });
});

describe("movement", () => {
  it("asks once, never when denied or granted", () => {
    expect(shouldRequestActivity("missing", false)).toBe(true);
    expect(shouldRequestActivity("missing", true)).toBe(false);
    expect(shouldRequestActivity("denied", false)).toBe(false);
    expect(shouldRequestActivity("granted", false)).toBe(false);
  });
});

describe("repeated taps", () => {
  it("runs the action once while busy", async () => {
    let calls = 0; let release!: () => void;
    const f = singleFlight(() => { calls++; return new Promise<void>((r) => (release = r)); });
    const p1 = f(); f(); f();
    release(); await p1;
    expect(calls).toBe(1);
  });
});
