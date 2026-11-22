import "@/i18n/nextBookingMessages";
import { displayText, useWorkerLanguage, serviceLabel, bookingStatusLabel, displayLocale } from "@/i18n/display";
import { leaderboardScore } from "@/lib/leaderboardRanking";
import { Card } from "@/components/ui/card";
import { Trophy, Star } from "lucide-react";

interface HomePerformanceCardProps {
  priorityScore?: number | null;
  rating?: number | null;
  totalRatings?: number | null;
}

function scoreColor(score: number) {
  if (score > 70) return { text: "text-emerald-700", iconBg: "bg-emerald-500", bar: "bg-emerald-500", track: "bg-emerald-100" };
  if (score >= 40) return { text: "text-amber-700", iconBg: "bg-amber-500", bar: "bg-amber-500", track: "bg-amber-100" };
  return { text: "text-red-700", iconBg: "bg-red-500", bar: "bg-red-500", track: "bg-red-100" };
}

function ratingColor(r: number) {
  if (r >= 4.5) return { text: "text-emerald-700", iconBg: "bg-emerald-500", bar: "bg-emerald-500", track: "bg-emerald-100" };
  if (r >= 4.0) return { text: "text-amber-700", iconBg: "bg-amber-500", bar: "bg-amber-500", track: "bg-amber-100" };
  return { text: "text-red-700", iconBg: "bg-red-500", bar: "bg-red-500", track: "bg-red-100" };
}

export default function HomePerformanceCard({ priorityScore, rating, totalRatings }: HomePerformanceCardProps) {
  useWorkerLanguage();
  const score = leaderboardScore(priorityScore);
  const scorePct = Math.max(0, Math.min(100, score ?? 0));
  const rate = rating ?? null;
  const sc = scoreColor(score ?? 0);
  const rc = ratingColor(rate ?? 0);
  const ratePct = Math.max(0, Math.min(100, ((rate ?? 0) / 5) * 100));

  return (
    <Card className="px-3 py-2 rounded-xl">
      <div className="flex items-center divide-x divide-border">
        <div className="flex-1 flex items-center gap-2 pr-3">
          <div className={`w-6 h-6 rounded-full ${sc.iconBg} flex items-center justify-center shrink-0`}>
            <Trophy className="w-3 h-3 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-col items-start">
              <p className="text-[11px] font-semibold text-muted-foreground">{displayText("Performance score")}</p>
              <p className={`text-xs font-bold ${sc.text}`}>
                {score ?? "—"}<span className="text-muted-foreground font-medium">/100</span>
              </p>
            </div>
            <div className={`mt-0.5 h-[3px] w-full rounded-full ${sc.track} overflow-hidden`}>
              <div className={`h-full ${sc.bar} rounded-full transition-all`} style={{ width: `${scorePct}%` }} />
            </div>
          </div>
        </div>

        <div className="flex-1 flex items-center gap-2 pl-3">
          <div className={`w-6 h-6 rounded-full ${rc.iconBg} flex items-center justify-center shrink-0`}>
            <Star className="w-3 h-3 text-white fill-current" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-1">
              <p className="text-[11px] font-semibold text-muted-foreground">{displayText("Rating")}</p>
              <p className={`text-xs font-bold ${rc.text}`}>{rate?.toFixed(1) ?? "—"} ★ · {totalRatings ?? "—"}</p>
            </div>
            <div className={`mt-0.5 h-[3px] w-full rounded-full ${rc.track} overflow-hidden`}>
              <div className={`h-full ${rc.bar} rounded-full transition-all`} style={{ width: `${ratePct}%` }} />
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
