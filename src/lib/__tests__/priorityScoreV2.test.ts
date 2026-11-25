import { describe, expect, it } from "vitest";
import { activePenalties, componentValue, headlineScore, parsePriorityScoreV2 } from "../priorityScoreV2";

const base = {
  contract_version: 2, v2_active: false, config_version: "v2.0", server_now: "2026-11-25T10:00:00Z",
  weights: { completed_bookings: 35, customer_ratings: 30, booking_acceptance: 20, start_otp_on_time: 15 },
  components: {
    start_otp_on_time: { points: null, state: "neutral" },
    completed_bookings: { points: 28, period_days: 30 },
    customer_ratings: { points: 22 },
    booking_acceptance: { points: 16, period_days: 7 },
  },
  raw_score: 66, penalty_deductions: 6, performance_score: 60, protection_adjustment: 0,
  protected_dispatch_score: 60, protection_ends_at: null, rating_display: { average: 4.8, count: 12 },
  penalties: [
    { id: "p1", reason: "Missed booking", points: -6, created_at: "2026-11-24T08:00:00Z", expires_at: "2026-12-01T08:00:00Z" },
    { id: "p2", reason: "Late Start OTP", points: 5, created_at: "2026-11-10T08:00:00Z", expires_at: "2026-11-17T08:00:00Z" },
  ],
};

describe("Priority Score V2 contract 2 (Admin is the only scoring authority)", () => {
  it("unavailable, old-contract or malformed responses keep the existing score", () => {
    for (const input of [null, {}, { ...base, contract_version: 1 }, { ...base, v2_active: "yes" }, { ...base, performance_score: "60" }, { ...base, components: "x" }, { ...base, v2_active: true, performance_score: null }])
      expect(parsePriorityScoreV2(input)).toBeNull();
    expect(headlineScore(61.35, null)).toEqual({ score: 61.35, source: "live", showPreview: false });
  });
  it("inactive V2 is a labelled preview and never replaces the official score", () => {
    expect(headlineScore(61.35, parsePriorityScoreV2(base))).toEqual({ score: 61.35, source: "live", showPreview: true });
  });
  it("active V2 shows performance_score as the main score", () => {
    expect(headlineScore(61.35, parsePriorityScoreV2({ ...base, v2_active: true }))).toEqual({ score: 60, source: "v2", showPreview: false });
  });
  it("copies all four components with maximums from server weights, in fixed order", () => {
    const v = parsePriorityScoreV2(base)!;
    expect(v.components.map(c => [c.key, c.points, c.max_points])).toEqual([
      ["completed_bookings", 28, 35], ["customer_ratings", 22, 30], ["booking_acceptance", 16, 20], ["start_otp_on_time", null, 15]]);
    expect(componentValue(v.components[3]).kind).toBe("not_measured");
  });
  it("keeps raw, deduction, protection and dispatch scores separate exactly as sent", () => {
    const v = parsePriorityScoreV2({ ...base, protection_adjustment: 8, protected_dispatch_score: 68, protection_ends_at: "2026-12-05T00:00:00Z" })!;
    expect([v.raw_score, v.penalty_deductions, v.v2_score, v.protection_adjustment, v.protected_dispatch_score]).toEqual([66, 6, 60, 8, 68]);
    expect(v.new_worker_protection).toEqual({ active: true, ends_at: "2026-12-05T00:00:00Z", detail: null });
  });
  it("lists only penalties the server still shows as running, with recovery dates", () => {
    expect(activePenalties(parsePriorityScoreV2(base)!).map(p => [p.id, p.points, p.expires_at])).toEqual([["p1", 6, "2026-12-01T08:00:00Z"]]);
  });
  it("unrated workers get New Worker, never a default rating", () => {
    expect(parsePriorityScoreV2({ ...base, rating_display: { kind: "new_worker" } })!.rating_display).toEqual({ kind: "new_worker" });
    expect(parsePriorityScoreV2({ ...base, rating_display: { average: 5, count: 0 } })!.rating_display).toEqual({ kind: "new_worker" });
  });
});
