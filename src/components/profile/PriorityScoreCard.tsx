import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Trophy, Star, TrendingUp, TrendingDown, CheckCircle2, XCircle, AlertTriangle, Clock, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatBookingAddress } from "@/lib/address";

interface PriorityScoreCardProps {
  worker: {
    id?: string;
    priority_score?: number | null;
    rating?: number | null;
    admin_override_rating?: number | null;
    total_ratings?: number | null;
    total_bookings_completed?: number | null;
  } | null;
}

// Penalty weights (must mirror recompute_priority_score_v2)
const PENALTY = {
  worker_cancelled: 10,
  no_movement: 15,
  worker_no_show: 20,
  complaint: 10,
} as const;

type FaultEvent = {
  id: string;
  reason_code: string;
  created_at: string;
};

function rankFromScore(score: number) {
  if (score >= 90) return { label: "Top 10%", emoji: "🥇", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/30" };
  if (score >= 75) return { label: "Top 25%", emoji: "🥈", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/30" };
  if (score >= 50) return { label: "Average", emoji: "🥉", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/30" };
  return { label: "Needs Improvement", emoji: "⚠️", color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/30" };
}

function tierLabelFromScore(score: number) {
  if (score >= 75) return "Top Performer";
  if (score >= 50) return "Strong Score";
  if (score >= 25) return "Building Up";
  return "Getting Started";
}

function reasonMeta(code: string) {
  switch (code) {
    case "worker_no_show":
      return { label: "No Show", penalty: PENALTY.worker_no_show, icon: XCircle };
    case "worker_cancelled":
      return { label: "Cancelled After Accept", penalty: PENALTY.worker_cancelled, icon: XCircle };
    case "no_movement":
      return { label: "No Movement", penalty: PENALTY.no_movement, icon: AlertTriangle };
    case "complaint":
      return { label: "Customer Complaint", penalty: PENALTY.complaint, icon: AlertTriangle };
    default:
      return { label: code.replace(/_/g, " "), penalty: 0, icon: AlertTriangle };
  }
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const day = 24 * 60 * 60 * 1000;
  if (diffMs < day) return "Today " + d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (diffMs < 2 * day) return "Yesterday";
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)} days ago`;
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

export default function PriorityScoreCard({ worker }: PriorityScoreCardProps) {
  const score = Math.round((worker?.priority_score ?? 0) * 10) / 10;
  const effectiveRating = worker?.admin_override_rating ?? worker?.rating ?? 0;
  const totalRatings = worker?.total_ratings ?? 0;
  const completedCount = worker?.total_bookings_completed ?? 0;

  const rank = rankFromScore(score);
  const tier = tierLabelFromScore(score);

  const [faults, setFaults] = useState<FaultEvent[]>([]);
  const [recentCompleted, setRecentCompleted] = useState<{ id: string; completed_at: string; flat_no: string | null; community: string | null }[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    if (!worker?.id) return;
    let cancelled = false;
    (async () => {
      const [{ data: faultRows }, { data: bookingRows }] = await Promise.all([
        supabase
          .from("worker_fault_events")
          .select("id, reason_code, created_at")
          .eq("worker_id", worker.id)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("bookings")
          .select("id, completed_at, flat_no, community")
          .eq("worker_id", worker.id)
          .eq("status", "completed")
          .not("completed_at", "is", null)
          .order("completed_at", { ascending: false })
          .limit(10),
      ]);
      if (cancelled) return;
      setFaults((faultRows ?? []) as FaultEvent[]);
      setRecentCompleted((bookingRows ?? []) as any);
    })();
    return () => {
      cancelled = true;
    };
  }, [worker?.id]);

  // Breakdown counters
  const penaltyCounts = faults.reduce<Record<string, number>>((acc, f) => {
    acc[f.reason_code] = (acc[f.reason_code] ?? 0) + 1;
    return acc;
  }, {});

  const breakdown: { label: string; value: number; positive: boolean }[] = [
    { label: "Base score", value: 50, positive: true },
    { label: "Completed Jobs", value: completedCount, positive: true },
  ];
  Object.entries(penaltyCounts).forEach(([code, count]) => {
    const meta = reasonMeta(code);
    if (meta.penalty > 0) {
      breakdown.push({
        label: `${meta.label} ×${count}`,
        value: -(meta.penalty * count),
        positive: false,
      });
    }
  });
  const ratingBonus = effectiveRating >= 4.8 && totalRatings >= 5 ? 5 : 0;
  if (ratingBonus > 0) {
    breakdown.push({ label: "High Rating Bonus", value: ratingBonus, positive: true });
  }

  // Merged timeline for modal
  const timeline = [
    ...faults.map((f) => {
      const m = reasonMeta(f.reason_code);
      return { id: f.id, when: f.created_at, label: m.label, points: -m.penalty, positive: false };
    }),
    ...recentCompleted.map((b) => ({
      id: b.id,
      when: b.completed_at,
      label: "Completed Booking",
      sublabel: formatBookingAddress(b as any),
      points: 1,
      positive: true,
    })),
  ].sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime()) as Array<{ id: string; when: string; label: string; sublabel?: string; points: number; positive: boolean }>;

  return (
    <Card className="border-0 shadow-lg overflow-hidden">
      {/* Header */}
      <CardHeader className="pb-3 bg-gradient-to-br from-primary/10 to-primary/5">
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="w-5 h-5 text-primary" />
          Priority Score
        </CardTitle>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        {/* Score */}
        <div>
          <div className="flex items-end justify-between mb-1">
            <div className="flex items-baseline gap-1">
              <span className="text-5xl font-extrabold text-primary leading-none">{score}</span>
              <span className="text-sm text-muted-foreground">/ 100</span>
            </div>
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star
                  key={i}
                  className={`w-3.5 h-3.5 ${
                    i <= Math.round(effectiveRating)
                      ? "fill-amber-400 text-amber-400"
                      : "text-muted-foreground/30"
                  }`}
                />
              ))}
            </div>
          </div>
          <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-2">{tier}</p>
          <Progress value={Math.min(score, 100)} className="h-2" />
          <div className={`mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${rank.bg} ${rank.color}`}>
            <span>{rank.emoji}</span>
            <span>Booking Priority Rank: {rank.label}</span>
          </div>
        </div>

        {/* Breakdown */}
        <div className="rounded-xl border border-border bg-muted/30 p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Score Breakdown
            </p>
            <span className="text-[10px] text-muted-foreground">How your score is built</span>
          </div>
          <div className="space-y-1.5">
            {breakdown.map((row, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-foreground">
                  {row.positive ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-red-500" />
                  )}
                  {row.label}
                </span>
                <span className={`font-bold tabular-nums ${row.positive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                  {row.value > 0 ? "+" : ""}{row.value}
                </span>
              </div>
            ))}
            <div className="border-t border-border pt-1.5 mt-1.5 flex items-center justify-between">
              <span className="text-sm font-bold">Final Priority Score</span>
              <span className="text-base font-extrabold text-primary tabular-nums">{score}</span>
            </div>
          </div>
        </div>

        {/* Your Rating */}
        <div className="bg-muted/40 rounded-lg p-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
            <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Your Rating</p>
            <p className="text-base font-bold text-foreground">
              {effectiveRating > 0 ? `${effectiveRating.toFixed(1)} ★` : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {totalRatings > 0 ? `${totalRatings} reviews` : "No reviews yet"}
            </p>
          </div>
        </div>

        {/* Positive Actions */}
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-950/20 p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
              What Increases Your Score
            </p>
          </div>
          <ul className="space-y-1.5 text-sm">
            <li className="flex items-center justify-between">
              <span className="flex items-center gap-2">✅ Complete bookings</span>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">+1 each</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="flex items-center gap-2">⭐ Maintain high ratings</span>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">+5 bonus</span>
            </li>
            <li className="flex items-center gap-2">✅ Reach customer on time</li>
            <li className="flex items-center gap-2">✅ Accept bookings regularly</li>
          </ul>
          <div className="mt-2 pt-2 border-t border-emerald-200/60 dark:border-emerald-900/40 text-xs text-emerald-700 dark:text-emerald-300">
            You've completed <span className="font-bold">{completedCount}</span> bookings so far.
          </div>
        </div>

        {/* Negative Actions */}
        <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/60 dark:bg-red-950/20 p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingDown className="w-4 h-4 text-red-600 dark:text-red-400" />
            <p className="text-xs font-bold uppercase tracking-wide text-red-700 dark:text-red-300">
              What Reduces Your Score
            </p>
          </div>
          <ul className="space-y-1.5 text-sm">
            <li className="flex items-center justify-between">
              <span>❌ Cancel After Accept</span>
              <span className="text-xs font-bold text-red-600 dark:text-red-400">-10</span>
            </li>
            <li className="flex items-center justify-between">
              <span>❌ No Show</span>
              <span className="text-xs font-bold text-red-600 dark:text-red-400">-20</span>
            </li>
            <li className="flex items-center justify-between">
              <span>❌ Accept but No Movement</span>
              <span className="text-xs font-bold text-red-600 dark:text-red-400">-15</span>
            </li>
            <li className="flex items-center justify-between">
              <span>⚠️ Customer Complaint</span>
              <span className="text-xs font-bold text-red-600 dark:text-red-400">-10</span>
            </li>
          </ul>
        </div>

        {/* How to reach 100 */}
        {score < 100 && (
          <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-primary mb-2">
              🎯 How to Reach 100
            </p>
            <ul className="space-y-1 text-sm text-foreground">
              <li>✅ Complete more bookings</li>
              <li>✅ Avoid cancellations</li>
              <li>✅ Avoid no-shows</li>
              <li>⭐ Maintain a 5-star rating</li>
            </ul>
          </div>
        )}

        {/* View Details */}
        <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
          <DialogTrigger asChild>
            <button className="w-full flex items-center justify-between rounded-lg border border-border bg-card hover:bg-muted/40 px-3 py-2.5 text-sm font-semibold transition-colors">
              <span className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                View Score History
              </span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-sm max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" />
                Score History
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-2 mt-2">
              {timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No recent activity yet.
                </p>
              ) : (
                timeline.slice(0, 30).map((t) => (
                  <div
                    key={t.id}
                    className={`flex items-center justify-between rounded-lg p-2.5 border ${
                      t.positive
                        ? "border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-950/20"
                        : "border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/20"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{t.positive ? "🟢" : "🔴"}</span>
                      <div>
                        <p className="text-sm font-semibold">{t.label}</p>
                        <p className="text-[10px] text-muted-foreground">{formatWhen(t.when)}</p>
                      </div>
                    </div>
                    <span
                      className={`text-sm font-bold tabular-nums ${
                        t.positive
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {t.points > 0 ? `+${t.points}` : t.points}
                    </span>
                  </div>
                ))
              )}
              <div className="border-t border-border pt-3 mt-3 flex items-center justify-between">
                <span className="text-sm font-bold">Current Score</span>
                <span className="text-lg font-extrabold text-primary">{score}</span>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
