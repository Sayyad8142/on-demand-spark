import { describe, it, expect } from "vitest";
import { offerGenerationKey, offerSecondsLeft } from "@/lib/offerGeneration";

describe("offer generation and fixed timer", () => {
  const first = { bookingId: "b1", bookingRequestId: "r1", timeoutAt: "2026-11-14T07:01:00Z" };
  it("transport duplicates share one identity", () => {
    expect(offerGenerationKey(first)).toBe(offerGenerationKey({ ...first, timeoutAt: "2026-11-14T07:01:00.000Z" }));
  });
  it("same request with a new server deadline is a new generation", () => {
    expect(offerGenerationKey(first)).not.toBe(offerGenerationKey({ ...first, timeoutAt: "2026-11-14T07:02:00Z" }));
  });
  it("simulated countdown uses supplied deadline, not a fresh 30 seconds", () => {
    expect(offerSecondsLeft(first.timeoutAt, Date.parse("2026-11-14T07:00:18Z"))).toBe(42);
    expect(offerSecondsLeft(first.timeoutAt, Date.parse("2026-11-14T07:00:40Z"))).toBe(20);
    expect(offerSecondsLeft(first.timeoutAt, Date.parse("2026-11-14T07:01:00Z"))).toBe(0);
  });
  it("invalid deadline never authorizes a simulated Accept", () => {
    expect(offerSecondsLeft("invalid", 0)).toBe(0);
  });
});