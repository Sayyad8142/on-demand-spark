import { describe, it, expect } from "vitest";
import { rankLeaderboard, summarizeReviews, parseRankingBoardRatings, parseRankingBoard, boardFromServer, leaderboardScore, RANKING_PAGE_TABS } from "../leaderboardRanking";

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
  it("uses Admin's ranking board average and count (4.85 from 13)", () => {
    const m = parseRankingBoardRatings([
      { rank: 1, worker_id: "w1", avg_rating: "4.85", ratings_count: 13, is_me: true },
      { rank: 2, worker_id: "w2", avg_rating: null, ratings_count: 0, is_me: false },
      { rank: 3, worker_id: "w3", avg_rating: 7, ratings_count: 2, is_me: false },
    ]);
    expect(m.get("w1")).toEqual({ count: 13, average: 4.85 });
    expect(m.get("w2")).toEqual({ count: 0, average: null });
    expect(m.has("w3")).toBe(false);
  });
  it("keeps Admin's exact order, rank and is_me without re-sorting", () => {
    const rows = parseRankingBoard([
      { rank: 1, worker_id: "b", full_name: "B", avg_rating: 4.2, ratings_count: 3, is_me: false },
      { rank: 2, worker_id: "a", full_name: "A", avg_rating: 5, ratings_count: 20, is_me: true },
      { rank: 3, worker_id: "c", full_name: "C", avg_rating: null, ratings_count: 0, is_me: false },
    ]);
    const entries = [{ id: "a", rank: 1, full_name: "A", photo_url: null, isMe: false, priority_score: 99, jobsToday: 9, earningsToday: 900 }];
    const out = boardFromServer(rows, entries as any, (r) => ({ id: r.worker_id, rank: r.rank, full_name: r.full_name, photo_url: null, isMe: r.is_me, priority_score: 0, jobsToday: 0, earningsToday: 0 }) as any);
    expect(out.map(w => [w.id, w.displayRank, w.isMe])).toEqual([["b", 1, false], ["a", 2, true], ["c", 3, false]]);
    expect(out[1].jobsToday).toBe(9);
  });
});
