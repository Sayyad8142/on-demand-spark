import { describe, it, expect } from "vitest";
import { buildNativeOverlayPayload, isAlertExpired } from "@/lib/nativeOverlayPayload";
import type { BookingAlert } from "@/services/bookingAlertCoordinator";

const NOW = Date.parse("2026-11-11T12:12:30Z");
const base: BookingAlert = {
  bookingId: "d2d1dacc-f8bb-443e-9f65-8bf0b074c6eb",
  bookingRequestId: "11edaedb-95f8-4b45-8f65-1005d8f8e727",
  custName: "C", community: "prestige-high-fields", serviceType: "maid", flatNo: "1203", priceInr: 199,
  timeoutAt: "2026-11-11T12:13:17.680Z", source: "realtime_requests",
};

describe("native pop-up payload", () => {
  it("carries the server expiry (12:13:17 UTC) as epoch seconds, not a fresh 60 s", () => {
    const p = JSON.parse(buildNativeOverlayPayload(base, NOW)!);
    expect(p.expires_at).toBe(Math.floor(Date.parse("2026-11-11T12:13:17.680Z") / 1000));
    expect(p.expires_at - Math.floor(NOW / 1000)).toBe(47);
  });

  it("carries the offer id so delivery confirmations target this exact offer", () => {
    expect(JSON.parse(buildNativeOverlayPayload(base, NOW)!).booking_request_id).toBe(base.bookingRequestId);
  });

  it("refuses an offer whose window already closed", () => {
    expect(buildNativeOverlayPayload(base, Date.parse("2026-11-11T12:13:18Z"))).toBeNull();
    expect(isAlertExpired(base, Date.parse("2026-11-11T12:13:18Z"))).toBe(true);
  });

  it("unknown expiry is sent as 0 (native keeps its own rules) and is not treated as expired", () => {
    const a = { ...base, timeoutAt: undefined };
    expect(JSON.parse(buildNativeOverlayPayload(a, NOW)!).expires_at).toBe(0);
    expect(isAlertExpired(a, NOW)).toBe(false);
  });
});
