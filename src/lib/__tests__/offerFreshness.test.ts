import { describe, it, expect } from "vitest";
import { isFreshOffer, createReconnectDetector } from "@/lib/offerFreshness";

const now = Date.parse("2026-10-22T10:00:00Z");
const inS = (s: number) => new Date(now + s * 1000).toISOString();

describe("offer freshness", () => {
  it("shows a pending offer with time left", () => {
    expect(isFreshOffer({ status: "pending", timeout_at: inS(30) }, now)).toBe(true);
  });
  it("never shows an expired offer", () => {
    expect(isFreshOffer({ status: "pending", timeout_at: inS(-1) }, now)).toBe(false);
  });
  it("never shows a server-recovered (already timed-out) offer even with a fresh timeout", () => {
    expect(isFreshOffer({ status: "pending", timeout_at: inS(60), recovered: true }, now)).toBe(false);
  });
  it("refuses closed statuses", () => {
    expect(isFreshOffer({ status: "timed_out", timeout_at: inS(30) }, now)).toBe(false);
  });
  it("refuses missing timeout", () => {
    expect(isFreshOffer({ status: "pending", timeout_at: null }, now)).toBe(false);
  });
});

describe("reconnect detector", () => {
  it("first connect is not a reconnect; reconnect after error is", () => {
    const d = createReconnectDetector();
    expect(d("SUBSCRIBED")).toBe(false);
    expect(d("CHANNEL_ERROR")).toBe(false);
    expect(d("SUBSCRIBED")).toBe(true);
    expect(d("SUBSCRIBED")).toBe(false);
  });
});
