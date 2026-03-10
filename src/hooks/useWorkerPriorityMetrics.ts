import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface WorkerPriorityMetrics {
  completions7d: number;
  onlineHours7d: number;
  acceptanceRate: number;
  totalRequests7d: number;
  acceptedRequests7d: number;
  rejectedRequests7d: number;
  priorityScore: number;
  rank: number | null;
  totalWorkersInCommunity: number | null;
  lastSeenAt: string | null;
  isRecentlyActive: boolean;
  rating: number;
  ratingsCount: number;
}

const DEFAULT_METRICS: WorkerPriorityMetrics = {
  completions7d: 0,
  onlineHours7d: 0,
  acceptanceRate: 0,
  totalRequests7d: 0,
  acceptedRequests7d: 0,
  rejectedRequests7d: 0,
  priorityScore: 0,
  rank: null,
  totalWorkersInCommunity: null,
  lastSeenAt: null,
  isRecentlyActive: false,
  rating: 5.0,
  ratingsCount: 0,
};

/**
 * Calculates a booking priority score (0–100) from worker metrics.
 * Mirrors the dispatch ranking algorithm factors.
 */
function calculatePriorityScore(
  completions7d: number,
  onlineHours7d: number,
  acceptanceRate: number, // 0–1
  isRecentlyActive: boolean,
  rating: number
): number {
  // completions: 5 pts each, cap at 40
  const completionScore = Math.min(completions7d * 5, 40);
  // online hours: 2 pts each, cap at 20
  const onlineScore = Math.min(onlineHours7d * 2, 20);
  // acceptance rate: up to 25 pts
  const acceptanceScore = acceptanceRate * 25;
  // recency boost: 5 pts if active in last 30 min
  const recencyBoost = isRecentlyActive ? 5 : 0;
  // rating boost: up to 10 pts (scaled from 0–5)
  const ratingBoost = Math.min((rating / 5) * 10, 10);

  return Math.round(
    Math.min(completionScore + onlineScore + acceptanceScore + recencyBoost + ratingBoost, 100)
  );
}

export function useWorkerPriorityMetrics(
  workerId: string | undefined,
  community: string | undefined,
  serviceType: string | undefined,
  rating: number,
  ratingsCount: number,
  lastActiveAt: string | null | undefined
) {
  const [metrics, setMetrics] = useState<WorkerPriorityMetrics>(DEFAULT_METRICS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workerId) {
      setLoading(false);
      return;
    }

    const fetchMetrics = async () => {
      setLoading(true);
      try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        // Fetch 7d completions and booking requests in parallel
        const [completionsRes, requestsRes] = await Promise.all([
          supabase
            .from("bookings")
            .select("id", { count: "exact", head: true })
            .eq("worker_id", workerId)
            .eq("status", "completed")
            .gte("completed_at", sevenDaysAgo),
          supabase
            .from("booking_requests")
            .select("status")
            .eq("worker_id", workerId)
            .gte("created_at", sevenDaysAgo),
        ]);

        const completions7d = completionsRes.count ?? 0;

        // Parse acceptance rate from booking_requests
        const requests = requestsRes.data ?? [];
        const totalRequests7d = requests.length;
        const acceptedRequests7d = requests.filter(
          (r) => r.status === "accepted"
        ).length;
        const rejectedRequests7d = requests.filter(
          (r) => r.status === "rejected" || r.status === "declined"
        ).length;
        const acceptanceRate =
          totalRequests7d > 0 ? acceptedRequests7d / totalRequests7d : 1;

        // Estimate online hours from last_active_at
        // In production this would come from a dedicated availability log table.
        // For now we estimate: if worker is active, assume ~2h/day average contribution
        const isRecentlyActive =
          !!lastActiveAt &&
          Date.now() - new Date(lastActiveAt).getTime() < 30 * 60 * 1000;

        // Rough estimate: completions × 1.5h average job time as proxy for online hours
        const onlineHours7d = Math.min(completions7d * 1.5 + (isRecentlyActive ? 2 : 0), 56);

        const priorityScore = calculatePriorityScore(
          completions7d,
          onlineHours7d,
          acceptanceRate,
          isRecentlyActive,
          rating
        );

        // Fetch rank: count workers in same community with higher estimated priority
        let rank: number | null = null;
        let totalWorkersInCommunity: number | null = null;

        if (community) {
          const { count: totalCount } = await supabase
            .from("workers")
            .select("id", { count: "exact", head: true })
            .eq("is_active", true)
            .contains("communities", [community]);

          totalWorkersInCommunity = totalCount ?? 0;

          // Simplified rank: use rating + completions as proxy since we can't compute
          // full priority for all workers client-side. Workers with higher rating rank higher.
          const { count: higherCount } = await supabase
            .from("workers")
            .select("id", { count: "exact", head: true })
            .eq("is_active", true)
            .contains("communities", [community])
            .gt("rating", rating);

          rank = (higherCount ?? 0) + 1;
        }

        setMetrics({
          completions7d,
          onlineHours7d: Math.round(onlineHours7d),
          acceptanceRate: Math.round(acceptanceRate * 100),
          totalRequests7d,
          acceptedRequests7d,
          rejectedRequests7d,
          priorityScore,
          rank,
          totalWorkersInCommunity,
          lastSeenAt: lastActiveAt ?? null,
          isRecentlyActive,
          rating,
          ratingsCount,
        });
      } catch (err) {
        console.error("Error fetching priority metrics:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
  }, [workerId, community, serviceType, rating, ratingsCount, lastActiveAt]);

  return { metrics, loading };
}
