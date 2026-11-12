// Display-only leaderboard ordering. Never feeds dispatch, payouts or priority.
export type LeaderboardTab = "top" | "earners" | "rated";
export const LEADERBOARD_TABS: LeaderboardTab[] = ["top", "earners", "rated"];
// Page navigation is separate from shared review-ranking functionality.
export type RankingPageTab = "top" | "earners" | "next";
export const RANKING_PAGE_TABS: RankingPageTab[] = ["top", "earners", "next"];

export interface RankableWorker {
  id: string;
  rank: number; // server priority rank
  rating: number;
  priority_score: number;
  jobsToday: number;
  earningsToday: number;
  isMe: boolean;
}

export interface ReviewStats { count: number; average: number | null }

export type RankedWorker<T> = T & { displayRank: number; reviewCount: number; reviewAverage: number | null };

export function summarizeReviews(rows: { worker_id: string | null; rating: number | null }[]): Map<string, ReviewStats> {
  const acc = new Map<string, { sum: number; count: number }>();
  for (const r of rows) {
    if (!r.worker_id || typeof r.rating !== "number" || r.rating <= 0) continue;
    const a = acc.get(r.worker_id) ?? { sum: 0, count: 0 };
    a.sum += r.rating; a.count += 1;
    acc.set(r.worker_id, a);
  }
  const out = new Map<string, ReviewStats>();
  acc.forEach((v, k) => out.set(k, { count: v.count, average: v.sum / v.count }));
  return out;
}

export function rankLeaderboard<T extends RankableWorker>(
  workers: T[], tab: LeaderboardTab, reviews: Map<string, ReviewStats>,
): RankedWorker<T>[] {
  const withStats = workers.map((w) => {
    const s = reviews.get(w.id);
    return { ...w, reviewCount: s?.count ?? 0, reviewAverage: s?.average ?? null };
  });
  const sorted = [...withStats];
  if (tab === "top") sorted.sort((a, b) => a.rank - b.rank);
  else if (tab === "earners")
    sorted.sort((a, b) => b.earningsToday - a.earningsToday || b.jobsToday - a.jobsToday || a.rank - b.rank);
  else
    sorted.sort((a, b) => {
      const ar = a.reviewCount > 0, br = b.reviewCount > 0;
      if (ar !== br) return ar ? -1 : 1;
      if (ar && br) return (b.reviewAverage! - a.reviewAverage!) || (b.reviewCount - a.reviewCount) || a.rank - b.rank;
      return a.rank - b.rank;
    });
  return sorted.map((w, i) => ({ ...w, displayRank: i + 1 }));
}
