import { afterEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({ isNative: true, platform: "android" }));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => native.isNative, getPlatform: () => native.platform },
}));

import { endedBookingIdFromRefetch, endedBookingIdFromUpdate, releaseNativeBookingLock } from "@/lib/bookingEndRelease";

const ME = "worker-1";

describe("ending a booking releases only the phone's alert lock", () => {
  afterEach(() => {
    delete (window as unknown as { Capacitor?: unknown }).Capacitor;
    native.isNative = true;
    native.platform = "android";
  });

  it("completed booking of mine is an ending", () => {
    expect(endedBookingIdFromUpdate({ id: "b1", status: "completed", worker_id: ME }, ME)).toBe("b1");
  });

  it("cancelled booking of mine is an ending", () => {
    expect(endedBookingIdFromUpdate({ id: "b1", status: "cancelled", worker_id: ME }, ME)).toBe("b1");
  });

  it("active statuses never release", () => {
    for (const status of ["assigned", "accepted", "on_the_way", "started", "in_progress"]) {
      expect(endedBookingIdFromUpdate({ id: "b1", status, worker_id: ME }, ME)).toBeNull();
    }
  });

  it("another worker's booking never releases my lock", () => {
    expect(endedBookingIdFromUpdate({ id: "b1", status: "completed", worker_id: "worker-2" }, ME)).toBeNull();
  });

  it("re-read with no active work ends the previous booking", () => {
    expect(endedBookingIdFromRefetch("b1", null, true)).toBe("b1");
  });

  it("re-read that still finds active work (same or different) does not release", () => {
    expect(endedBookingIdFromRefetch("b1", { id: "b1", status: "started" }, true)).toBeNull();
    expect(endedBookingIdFromRefetch("b1", { id: "b2", status: "assigned" }, true)).toBeNull();
  });

  it("failed re-read never releases", () => {
    expect(endedBookingIdFromRefetch("b1", null, false)).toBeNull();
  });

  it("calls only the local native release, with just the booking id", () => {
    const releaseEndedBooking = vi.fn().mockResolvedValue(undefined);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    (window as unknown as { Capacitor: unknown }).Capacitor = { Plugins: { OverlayPlugin: { releaseEndedBooking } } };
    releaseNativeBookingLock("b1");
    expect(releaseEndedBooking).toHaveBeenCalledWith({ bookingId: "b1" });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("does nothing off Android or on older builds without the method", () => {
    native.isNative = false;
    const releaseEndedBooking = vi.fn();
    (window as unknown as { Capacitor: unknown }).Capacitor = { Plugins: { OverlayPlugin: { releaseEndedBooking } } };
    releaseNativeBookingLock("b1");
    expect(releaseEndedBooking).not.toHaveBeenCalled();
    native.isNative = true;
    (window as unknown as { Capacitor: unknown }).Capacitor = { Plugins: { OverlayPlugin: {} } };
    expect(() => releaseNativeBookingLock("b1")).not.toThrow();
  });
});
