/** Score-based badge (no ranking claim). Labels are English source strings for displayText. */
export type PriorityBadgeLevel = "excellent" | "very_good" | "good" | "needs_improvement" | "low";

export function priorityBadge(score: number): { level: PriorityBadgeLevel; label: string } {
  const s = Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0;
  if (s >= 90) return { level: "excellent", label: "Excellent" };
  if (s >= 75) return { level: "very_good", label: "Very Good" };
  if (s >= 50) return { level: "good", label: "Good" };
  if (s >= 25) return { level: "needs_improvement", label: "Needs Improvement" };
  return { level: "low", label: "Low Priority" };
}
