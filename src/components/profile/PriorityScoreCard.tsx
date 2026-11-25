import "@/i18n/nextBookingMessages";
import { displayText, useWorkerLanguage, serviceLabel, bookingStatusLabel, displayLocale } from "@/i18n/display";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Trophy, Star } from "lucide-react";
import { parsePriorityBreakdown, type PriorityPart } from "@/lib/priorityBreakdown";
import { priorityBadge } from "@/lib/priorityBadge";
import { leaderboardScore } from "@/lib/leaderboardRanking";
import { useWorkerPriority } from "@/hooks/useWorkerPriority";
import "@/i18n/lateStartMessages";
import "@/i18n/priorityScoreV2Messages";
import { usePriorityScoreV2 } from "@/hooks/usePriorityScoreV2";
import { headlineScore } from "@/lib/priorityScoreV2";
import PriorityScoreV2Breakdown from "./PriorityScoreV2Breakdown";

interface PriorityScoreCardProps {
  worker: {
    id?: string;
    priority_score?: number | null;
    rating?: number | null;
    admin_override_rating?: number | null;
    total_ratings?: number | null;
    total_bookings_completed?: number | null;
    score_reason?: string | null;
  } | null;
}

const BADGE_STYLE = {
  excellent: { emoji: "🥇", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
  very_good: { emoji: "🥈", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/30" },
  good: { emoji: "🥉", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/30" },
  needs_improvement: { emoji: "⚠️", color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-950/30" },
  low: { emoji: "⚠️", color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/30" },
} as const;

function rankFromScore(score: number) {
  const b = priorityBadge(score);
  return { label: displayText(b.label), ...BADGE_STYLE[b.level] };
}

function tierLabelFromScore(score: number) {
  if (score >= 75) return displayText("Top Performer");
  if (score >= 50) return displayText("Strong Score");
  if (score >= 25) return displayText("Building Up");
  return displayText("Getting Started");
}

export default function PriorityScoreCard({ worker }: PriorityScoreCardProps) {
  useWorkerLanguage();
  const priority = useWorkerPriority(worker?.id);
  const liveScore = worker?.id ? (priority.isError ? null : priority.data?.score ?? null) : leaderboardScore(worker?.priority_score);
  // V2 replaces the live score only when Admin confirms V2 is active; otherwise it is a labelled preview.
  const v2 = usePriorityScoreV2(worker?.id);
  const v2Data = v2.data ?? null;
  const headline = headlineScore(liveScore, v2Data);
  const score = headline.score;
  const effectiveRating = worker?.admin_override_rating ?? worker?.rating ?? 0;
  // No customer ratings yet: never show the stored default as stars.
  const unrated = worker?.admin_override_rating == null && !(typeof worker?.total_ratings === "number" && worker.total_ratings > 0);
  const stored = score;
  const breakdown = headline.source === "v2" ? null : parsePriorityBreakdown(worker?.id ? priority.data?.reason : worker?.score_reason, stored);
  const partLabel: Record<PriorityPart["key"], string> = {
    completed: displayText("Completed jobs (last 7 days)"), online: displayText("Online hours (last 7 days)"),
    rating: displayText("Customer rating"), recent: displayText("Active in last 24 hours"),
    topRating: displayText("Rating 4.5 or above"), connection: displayText("Connection and alert replies"),
    penalties: displayText("Missed or not reached"),
    lateStartOtp: displayText("Late Start OTP"),
  };

  const rank = score === null ? null : rankFromScore(score);
  const tier = score === null ? null : tierLabelFromScore(score);

  return (
    <Card className="border-0 shadow-lg overflow-hidden">
      {/* Header */}
      <CardHeader className="pb-3 bg-gradient-to-br from-primary/10 to-primary/5">
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="w-5 h-5 text-primary" />
          {displayText("Performance score")}
        </CardTitle>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        {/* Score */}
        <div>
          <div className="flex items-end justify-between mb-1">
            <div className="flex items-baseline gap-1">
              <span className="text-5xl font-extrabold text-primary leading-none">{score ?? "—"}</span>
              <span className="text-sm text-muted-foreground">/ 100</span>
            </div>
            {unrated ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{displayText("New Worker")}</span>
            ) : <div className="flex items-center gap-0.5">
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
            </div>}
          </div>
          {tier && <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-2">{tier}</p>}
          <Progress value={Math.max(0, Math.min(score ?? 0, 100))} className="h-2" />
          {rank && <div className={`mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${rank.bg} ${rank.color}`}>
            <span>{rank.emoji}</span>
            <span>{displayText("Score Level:")} {rank.label}</span>
          </div>}
        </div>
        {v2Data && (headline.source === "v2" || headline.showPreview) && (
          <PriorityScoreV2Breakdown data={v2Data} preview={headline.source !== "v2"} refreshing={v2.isFetching} onRefresh={() => { void v2.refetch(); void priority.refetch(); }} />
        )}
        {headline.source === "v2" ? null : breakdown ? (
          <ul className="space-y-1 text-xs" aria-label={displayText("How your score is made")}>
            {breakdown.parts.filter(p => p.points !== 0).map(p => (
              <li key={p.key} className="flex justify-between gap-2">
                <span className="text-muted-foreground">{partLabel[p.key]}{p.key === "lateStartOtp" && <span className="block text-[11px]">{displayText("Start OTP delayed.")}</span>}</span>
                <span className={`font-semibold ${p.points < 0 ? "text-destructive" : ""}`}>{p.points > 0 ? "+" : ""}{Math.round(p.points * 10) / 10}</span>
              </li>
            ))}
            <li className="flex justify-between gap-2 border-t border-border pt-1 font-bold">
              <span>{displayText("Your score")}</span><span>{breakdown.final}</span>
            </li>
          </ul>
        ) : stored !== null ? (
          <p className="text-xs text-muted-foreground">{displayText("Score details are not available right now.")}</p>
        ) : null}
        <p className="text-[11px] text-muted-foreground">{headline.source === "v2" && v2Data?.weighted_dispatch_active ? displayText("A higher score can bring you booking offers sooner.") : displayText("Your score shows your recent performance. It does not decide the order in which booking offers are sent.")}</p>

      </CardContent>
    </Card>
  );
}

