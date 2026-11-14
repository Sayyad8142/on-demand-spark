import { describe, it, expect, vi, beforeEach } from "vitest";

const native: { platform: string; isNative: boolean; plugin: Record<string, unknown> | null } = {
  platform: "web",
  isNative: false,
  plugin: null,
};

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => native.isNative,
    getPlatform: () => native.platform,
  },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/scheduledBookingGuards", () => ({
  canShowWorkerBookingOffer: () => true,
  isBeforeScheduledDispatchWindow: () => false,
  logScheduledOfferDecision: () => {},
}));

import { classifyAcceptResult, canRetryAccept } from "@/lib/acceptOutcome";
import { claimDeviceAcceptance, releaseDeviceAcceptance } from "@/lib/deviceAcceptLock";

beforeEach(() => {
  native.platform = "web";
  native.isNative = false;
  native.plugin = null;
  (window as unknown as { Capacitor?: unknown }).Capacitor = undefined;
});

function useNativePlugin(plugin: Record<string, unknown>) {
  native.platform = "android";
  native.isNative = true;
  native.plugin = plugin;
  (window as unknown as { Capacitor: unknown }).Capacitor = { Plugins: { OverlayPlugin: plugin } };
}

describe("accept outcome rules", () => {
  it.each(["offer-expired", "already-assigned", "not-offered", "duplicate offer"])("stable server refusal %s closes the offer", (error) => {
    expect(classifyAcceptResult({ success: false, error })).toBe("gone");
  });
  it("stable acceptance-closed is final", () => {
    expect(classifyAcceptResult({ success: false, error: "acceptance-closed" })).toBe("closed");
  });
  it("server confirmed → won", () => {
    expect(classifyAcceptResult({ success: true })).toBe("won");
  });
  it("after operating hours → closed", () => {
    expect(classifyAcceptResult({ success: false, acceptanceClosed: true, error: "x" })).toBe("closed");
  });
  it("taken / expired / assigned → gone (offer closes)", () => {
    for (const e of ["Booking already accepted", "Offer expired", "booking-already-accepted", "Booking is no longer available", "Already assigned"]) {
      expect(classifyAcceptResult({ success: false, error: e })).toBe("gone");
    }
  });
  it("network / session / unknown → retry (offer stays open)", () => {
    for (const e of ["TypeError: Failed to fetch", "Session expired. Please log in again.", "JWT expired", "", "HTTP 500"]) {
      expect(classifyAcceptResult({ success: false, error: e })).toBe("retry");
    }
  });
  it("retry only while the server window is open — never extends an expired offer", () => {
    const now = Date.parse("2026-11-07T10:00:00Z");
    expect(canRetryAccept("2026-11-07T10:00:30Z", now)).toBe(true);
    expect(canRetryAccept("2026-11-07T09:59:59Z", now)).toBe(false);
    expect(canRetryAccept(null, now)).toBe(true);
  });
});

describe("one Accept per booking on the phone", () => {
  it("a different booking cannot claim while any Accept is in flight", async () => {
    expect(await claimDeviceAcceptance("first")).toBe(true);
    expect(await claimDeviceAcceptance("second")).toBe(false);
    await releaseDeviceAcceptance("second", false);
    expect(await claimDeviceAcceptance("second")).toBe(false);
    await releaseDeviceAcceptance("first", false);
    expect(await claimDeviceAcceptance("second")).toBe(true);
    await releaseDeviceAcceptance("second", false);
  });
  it("a second tap while the first is running is ignored; after release it can retry", async () => {
    expect(await claimDeviceAcceptance("b-dup")).toBe(true);
    expect(await claimDeviceAcceptance("b-dup")).toBe(false);
    await releaseDeviceAcceptance("b-dup", false);
    expect(await claimDeviceAcceptance("b-dup")).toBe(true);
    await releaseDeviceAcceptance("b-dup", false);
  });

  it("in-app Accept is blocked while the Android pop-up already claimed the booking", async () => {
    const claimAcceptance = vi.fn(async () => ({ claimed: false }));
    useNativePlugin({ claimAcceptance, releaseAcceptance: vi.fn(async () => {}) });
    expect(await claimDeviceAcceptance("b-native")).toBe(false);
    expect(claimAcceptance).toHaveBeenCalledWith({ bookingId: "b-native" });
    // JS claim was released, so a later attempt is possible once native frees it.
    claimAcceptance.mockResolvedValueOnce({ claimed: true });
    expect(await claimDeviceAcceptance("b-native")).toBe(true);
    await releaseDeviceAcceptance("b-native", false);
  });

  it("a confirmed win is recorded on the native side too", async () => {
    const releaseAcceptance = vi.fn(async () => {});
    useNativePlugin({ claimAcceptance: vi.fn(async () => ({ claimed: true })), releaseAcceptance });
    expect(await claimDeviceAcceptance("b-win")).toBe(true);
    await releaseDeviceAcceptance("b-win", true);
    expect(releaseAcceptance).toHaveBeenCalledWith({ bookingId: "b-win", accepted: true });
  });

  it("older Android build without the shared claim still works (JS lock only)", async () => {
    useNativePlugin({ claimAcceptance: vi.fn(async () => { throw new Error("not implemented"); }) });
    expect(await claimDeviceAcceptance("b-old")).toBe(true);
    expect(await claimDeviceAcceptance("b-old")).toBe(false);
    await releaseDeviceAcceptance("b-old", false);
  });
});
