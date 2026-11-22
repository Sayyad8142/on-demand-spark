import { describe, it, expect } from "vitest";
import { rankLeaderboard, summarizeReviews, leaderboardScore, RANKING_PAGE_TABS } from "../leaderboardRanking";

const w = (id: string, rank: number, earningsToday: number, jobsToday = 0) =>
  ({ id, rank, rating: 5, priority_score: 50, jobsToday, earningsToday, isMe: false });
const list = [w("a", 1, 100), w("b", 2, 500), w("c", 3, 300)];

describe("leaderboard ranking", () => {
  it("preserves the example's exact performance scores without rounding or inventing values", () => {
    expect([58, 55, 40.5, 40].map(leaderboardScore)).toEqual([58, 55, 40.5, 40]);
    expect(leaderboardScore(0)).toBe(0);
    expect(leaderboardScore(NaN)).toBeNull();
    expect(leaderboardScore(undefined)).toBeNull();
  });
  it("uses the exact same Home, Profile and ranking score, including zero and unknown values", () => {
    expect(leaderboardScore(46.75)).toBe(46.75);
    expect(leaderboardScore(40.5)).toBe(40.5);
    expect(leaderboardScore(0)).toBe(0);
    expect(leaderboardScore(null)).toBeNull();
    expect(leaderboardScore(Infinity)).toBeNull();
  });
  it("keeps only worker and earner navigation after Next Booking removal", () => {
    expect(RANKING_PAGE_TABS).toEqual(["top", "earners"]);
  });
  it("Top Workers keeps the server priority order", () => {
    expect(rankLeaderboard(list, "top", new Map()).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
  it("Top Earners puts the highest earner today at #1", () => {
    const r = rankLeaderboard(list, "earners", new Map());
    expect(r.map((x) => x.id)).toEqual(["b", "c", "a"]);
    expect(r[0].displayRank).toBe(1);
  });
  it("Top Rated sorts by average, review count breaks ties, unreviewed go last", () => {
    const reviews = summarizeReviews([
      { worker_id: "a", rating: 4 },
      { worker_id: "b", rating: 5 }, { worker_id: "b", rating: 5 },
      { worker_id: "c", rating: 5 },
    ]);
    const extra = [...list, w("d", 0, 0)];
    expect(rankLeaderboard(extra, "rated", reviews).map((x) => x.id)).toEqual(["b", "c", "a", "d"]);
  });
});

import { parsePriorityBreakdown } from "../priorityBreakdown";
describe("Priority score breakdown (server parts only)", () => {
  const reason = "completed_7d=3 online_h=0 rating=5.00 accept%=100 total_req=6 not_reached=0 fault=0 no_ack=0 bucket=top pts(c/o/r/rec/b/reach/pen)=15/0/25.0/5/10/13/0 final=68";
  it("shows the server's saved parts for the stored score", () => {
    const b = parsePriorityBreakdown(reason, 68)!;
    expect(b.parts.map(p => p.points)).toEqual([15, 0, 25, 5, 10, 13, -0]);
    expect(b.final).toBe(68);
  });
  it("shows penalties as negative", () => {
    const b = parsePriorityBreakdown("pts(c/o/r/rec/b/reach/pen)=10/0/21/5/0/3/13 final=26", 26)!;
    expect(b.parts.find(p => p.key === "penalties")!.points).toBe(-13);
  });
  it("shows no breakdown when it does not match the stored score or is missing", () => {
    expect(parsePriorityBreakdown(reason, 50)).toBeNull();
    expect(parsePriorityBreakdown(null, 68)).toBeNull();
    expect(parsePriorityBreakdown("garbage", 68)).toBeNull();
  });
  it("a stored score of 0 keeps 0", () => {
    expect(parsePriorityBreakdown("pts(c/o/r/rec/b/reach/pen)=0/0/0/0/0/0/40 final=0", 0)!.final).toBe(0);
  });
});
