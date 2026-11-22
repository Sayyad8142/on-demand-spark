import { describe, expect, it } from "vitest";
import { rankWorkers, type RankableWorker } from "../../../docs/dispatch-mismatch-2026-11-22/source-reference/admin-ranking";
import { selectNextBatch, type SimpleWorker } from "../../../docs/dispatch-mismatch-2026-11-22/source-reference/admin-simpleDispatch";
import { recordedDispatch } from "../../../docs/dispatch-mismatch-2026-11-22/staged/recordedDispatch";

// Read-only reconstruction: scores from stored dispatch_batch, offer times from
// booking_requests. This validates the Admin snapshot's algorithm against real
// records, not the unavailable hosted edge source or historical token state.
const NOW = Date.parse("2026-11-22T04:40:53.108Z");
interface Worker extends RankableWorker { id: string; name: string; hasToken: boolean }
const pool: Worker[] = [
  { id: "sid", name: "Sid", priority_score: 58, rating: 5, total_ratings: 15, last_offer_at: "2026-11-22T04:39:01.162Z", hasToken: true },
  { id: "company", name: "Didi Now private limited", priority_score: 55, rating: 5, total_ratings: 0, last_offer_at: null, hasToken: false },
  { id: "anusha", name: "Anusha m", priority_score: 40.5, rating: 3.5, total_ratings: 2, last_offer_at: "2026-11-22T04:37:19.655Z", hasToken: true },
  { id: "mounika", name: "Kethavath mounika", priority_score: 40, rating: 4, total_ratings: 0, last_offer_at: "2026-11-22T04:37:19.655Z", hasToken: true },
  { id: "nagarani", name: "Nagarani m", priority_score: 30.8, rating: 3.56, total_ratings: 9, last_offer_at: "2026-11-22T04:37:19.655Z", hasToken: true },
  { id: "jyothi", name: "Jyothi G", priority_score: 24, rating: 4.2, total_ratings: 5, last_offer_at: "2026-11-22T04:37:19.655Z", hasToken: true },
  { id: "kalyani", name: "Kalyani sapavath", priority_score: 23, rating: 4, total_ratings: 0, last_offer_at: "2026-11-22T04:37:19.655Z", hasToken: true },
  { id: "kaveri", name: "Kaveri vadde", priority_score: 23, rating: 4, total_ratings: 0, last_offer_at: "2026-11-22T04:39:01.162Z", hasToken: true },
  { id: "kavitha", name: "Kavitha vadde", priority_score: 15, rating: 5, total_ratings: 3, last_offer_at: "2026-11-22T04:39:01.162Z", hasToken: true },
];
const base = pool.filter(w => w.hasToken).sort((a, b) => Number(b.priority_score) - Number(a.priority_score));
const firstNames = ["Anusha m", "Kethavath mounika", "Nagarani m", "Jyothi G", "Kalyani sapavath"];
describe("22 November 10:10 IST dispatch replay — Admin snapshot", () => {
  it("uniform rotation reproduces the exact first five despite Sid's score 58", () => {
    const ordered = rankWorkers(base, NOW, { uniform: true });
    expect(ordered.slice(0, 5).map(w => w.name)).toEqual(firstNames);
    expect(ordered[5]?.name).toBe("Sid");
    expect(pool.find(w => w.id === "sid")?.priority_score).toBe(58);
  });
  it("untried second batch has three, not a configuration reduction from five", () => {
    const ordered = rankWorkers(base, NOW, { uniform: true });
    const offered = new Set(ordered.slice(0, 5).map(w => w.id));
    expect(rankWorkers(base.filter(w => !offered.has(w.id)), NOW, { uniform: true }).slice(0, 5).map(w => w.name))
      .toEqual(["Sid", "Kaveri vadde", "Kavitha vadde"]);
  });
  it("uniform ties preserve the priority-ordered base query, not arbitrary worker ids", () => {
    expect(rankWorkers(base.slice(0, 5).map(w => ({ ...w, last_offer_at: "2026-11-22T04:37:19.655Z" })), NOW, { uniform: true })
      .map(w => w.id)).toEqual(base.slice(0, 5).map(w => w.id));
  });
  it("old Simple Preview counts the tokenless company account among nine while dispatch has eight", () => {
    const preview: SimpleWorker[] = pool.map(w => ({ ...w, full_name: w.name, rating: w.rating ?? null,
      is_active: true, is_blocked: false, is_available: true, is_busy: false,
      communities: ["prestige-high-fields"], service_types: ["maid"], slots_for_day: ["10:00:00"], fcm_token: w.hasToken ? "fixture" : null }));
    const result = selectNextBatch(preview, { community: "prestige-high-fields", service: "maid", slot: "10:10", batchSize: 5, alreadyOffered: new Set() });
    expect(result.ordered).toHaveLength(9);
    expect(base).toHaveLength(8);
    expect(result.ordered.some(w => w.id === "company")).toBe(true);
    expect(result.nextBatch.map(w => w.id)).not.toEqual(rankWorkers(base, NOW, { uniform: true }).slice(0, 5).map(w => w.id));
  });
});

describe("staged historical Admin panel projection", () => {
  const requests = [...firstNames, "Sid", "Kaveri vadde", "Kavitha vadde"].map((name, i) => ({
    worker_id: `worker-${i}`, worker_name: name, status: i === 5 ? "accepted" : "timed_out", order_sequence: i + 1,
    offered_at: i < 5 ? "2026-11-22T04:40:53.108Z" : "2026-11-22T04:42:01.087Z",
    timeout_at: i < 5 ? "2026-11-22T04:41:53.108Z" : "2026-11-22T04:43:01.087Z",
    phone: "must-not-copy", fcm_token: "must-not-copy", priority_score: 999,
  }));
  const audit = { runs: [
    { attempt_number: 2, started_at: "2026-11-22T04:42:01.325Z", workers_eligible: 8, workers_selected: 3 },
    { attempt_number: 1, started_at: "2026-11-22T04:40:53.315Z", workers_eligible: 8, workers_selected: 5 },
  ], requests: [...requests].reverse() };
  it("shows actual waves 5 then 3, ordered by recorded sequence and never score", () => {
    const result = recordedDispatch(audit);
    expect(result.map(w => w.offers.map(o => o.workerName))).toEqual([firstNames, ["Sid", "Kaveri vadde", "Kavitha vadde"]]);
    expect(result[1]?.offers[0]?.status).toBe("accepted");
    expect(result.map(w => w.selected)).toEqual([5, 3]);
  });
  it("copies no phone, push token or score into the panel model", () => {
    const result = JSON.stringify(recordedDispatch(audit));
    expect(result).not.toContain("must-not-copy");
    expect(result).not.toContain("priority_score");
  });
  it("rejects unverifiable or unmatched records rather than inventing the next group", () => {
    expect(() => recordedDispatch({})).toThrow("unverified_audit");
    expect(() => recordedDispatch({ ...audit, runs: [] })).toThrow("unmatched_request");
  });
});