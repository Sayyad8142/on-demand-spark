import { describe, expect, it } from "vitest";
import { activePenalties, componentValue, headlineScore, parsePriorityScoreV2 } from "../priorityScoreV2";

const base = {
  contract_version: 1, status: "preview", live_score: 61.35, v2_score: 72, max_score: 100,
  weighted_dispatch_active: false, server_now: "2026-11-25T10:00:00Z", updated_at: "2026-11-25T09:45:00Z",
  components: [
    { key: "start_otp_on_time", points: null, max_points: 15, state: "neutral" },
    { key: "completed_bookings", points: 28, max_points: 35, state: "measured", period_days: 30 },
    { key: "customer_ratings", points: 22, max_points: 30, state: "measured" },
    { key: "booking_acceptance", points: 16, max_points: 20, state: "measured", period_days: 7 },
  ],
  penalties: [
    { id: "p1", reason: "Missed booking", points: -6, created_at: "2026-11-24T08:00:00Z", expires_at: "2026-12-01T08:00:00Z", recovery: "Removed after 7 days" },
    { id: "p2", reason: "Late Start OTP", points: 5, created_at: "2026-11-10T08:00:00Z", expires_at: "2026-11-17T08:00:00Z" },
  ],
  new_worker_protection: { active: false, ends_at: null },
};

describe("Priority Score V2 (Admin is the only scoring authority)", () => {
  it("unavailable or malformed service keeps the existing live score", () => {
    for (const input of [null, undefined, {}, { ...base, contract_version: 2 }, { ...base, status: "on" }, { ...base, max_score: 0 }, { ...base, components: "x" }])
      expect(parsePriorityScoreV2(input)).toBeNull();
    expect(headlineScore(61.35, null)).toEqual({ score: 61.35, source: "live", showPreview: false });
  });
  it("inactive V2 keeps the existing live score and shows no preview", () => {
    const v = parsePriorityScoreV2({ ...base, status: "inactive" });
    expect(headlineScore(61.35, v)).toEqual({ score: 61.35, source: "live", showPreview: false });
  });
  it("preview V2 is labelled preview and never replaces the official score", () => {
    const v = parsePriorityScoreV2(base);
    expect(headlineScore(61.35, v)).toEqual({ score: 61.35, source: "live", showPreview: true });
  });
  it("active V2 uses the server-confirmed V2 score automatically", () => {
    const v = parsePriorityScoreV2({ ...base, status: "active" });
    expect(headlineScore(61.35, v)).toEqual({ score: 72, source: "v2", showPreview: false });
    expect(parsePriorityScoreV2({ ...base, status: "active", v2_score: null })).toBeNull();
  });
  it("copies Admin's points and maximums in fixed order without adding them up", () => {
    const v = parsePriorityScoreV2(base)!;
    expect(v.components.map(c => [c.key, c.points, c.max_points])).toEqual([
      ["completed_bookings", 28, 35], ["customer_ratings", 22, 30], ["booking_acceptance", 16, 20], ["start_otp_on_time", null, 15],
    ]);
    expect(v.v2_score).toBe(72);
  });
  it("neutral OTP shows Not measured yet; unrated shows New Worker, never 5.0", () => {
    const v = parsePriorityScoreV2({ ...base, components: [
      { key: "customer_ratings", points: null, max_points: 30, state: "new_worker" },
      { key: "start_otp_on_time", points: null, max_points: 15, state: "neutral" },
    ] })!;
    expect(componentValue(v.components[0])).toEqual({ kind: "new_worker", max: 30 });
    expect(componentValue(v.components[1])).toEqual({ kind: "not_measured", max: 15 });
  });
  it("shows active penalties with expiry and recovery; hides expired ones by server time", () => {
    const v = parsePriorityScoreV2(base)!;
    expect(activePenalties(v)).toEqual([{ id: "p1", reason: "Missed booking", points: 6, created_at: "2026-11-24T08:00:00Z", expires_at: "2026-12-01T08:00:00Z", recovery: "Removed after 7 days" }]);
  });
  it("reads new-worker protection from the server", () => {
    const v = parsePriorityScoreV2({ ...base, new_worker_protection: { active: true, ends_at: "2026-12-05T00:00:00Z", detail: "First 14 days" } })!;
    expect(v.new_worker_protection).toEqual({ active: true, ends_at: "2026-12-05T00:00:00Z", detail: "First 14 days" });
  });
  it("only claims booking priority when Admin confirms weighted dispatch", () => {
    expect(parsePriorityScoreV2(base)!.weighted_dispatch_active).toBe(false);
    expect(parsePriorityScoreV2({ ...base, weighted_dispatch_active: "yes" })!.weighted_dispatch_active).toBe(false);
    expect(parsePriorityScoreV2({ ...base, weighted_dispatch_active: true })!.weighted_dispatch_active).toBe(true);
  });
});
