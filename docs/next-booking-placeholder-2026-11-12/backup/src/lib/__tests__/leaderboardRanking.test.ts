import { describe, it, expect } from "vitest";
import { rankLeaderboard, summarizeReviews } from "../leaderboardRanking";

const w = (id: string, rank: number, earningsToday: number, jobsToday = 0) =>
  ({ id, rank, rating: 5, priority_score: 50, jobsToday, earningsToday, isMe: false });
const list = [w("a", 1, 100), w("b", 2, 500), w("c", 3, 300)];

describe("leaderboard ranking", () => {
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
