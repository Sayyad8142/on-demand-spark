import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Trophy, Star, ChevronRight } from "lucide-react";

interface HomePerformanceCardProps {
  priorityScore?: number | null;
  rating?: number | null;
  totalRatings?: number | null;
}

function scoreColor(score: number) {
  if (score > 70) return { text: "text-emerald-700", bar: "bg-emerald-500", track: "bg-emerald-100", iconBg: "bg-emerald-500", icon: "text-white" };
  if (score >= 40) return { text: "text-amber-700", bar: "bg-amber-500", track: "bg-amber-100", iconBg: "bg-amber-500", icon: "text-white" };
  return { text: "text-red-700", bar: "bg-red-500", track: "bg-red-100", iconBg: "bg-red-500", icon: "text-white" };
}

function ratingColor(r: number) {
  if (r >= 4.5) return { text: "text-emerald-700", bar: "bg-emerald-500", track: "bg-emerald-100", iconBg: "bg-emerald-500", icon: "text-white" };
  if (r >= 4.0) return { text: "text-amber-700", bar: "bg-amber-500", track: "bg-amber-100", iconBg: "bg-amber-500", icon: "text-white" };
  return { text: "text-red-700", bar: "bg-red-500", track: "bg-red-100", iconBg: "bg-red-500", icon: "text-white" };
}

export default function HomePerformanceCard({ priorityScore, rating, totalRatings }: HomePerformanceCardProps) {
  const navigate = useNavigate();
  const score = Math.max(0, Math.min(100, Math.round(priorityScore ?? 0)));
  const hasRatings = (totalRatings ?? 0) > 0 && (rating ?? 0) > 0;
  const rate = hasRatings ? Number(rating) : 5;
  const sc = scoreColor(score);
  const rc = ratingColor(rate);
  const ratePct = Math.max(0, Math.min(100, (rate / 5) * 100));

  return (
    <Card className="px-3 py-2 rounded-xl">
      <div className="flex items-center divide-x divide-border">
        {/* Priority Score */}
        <button
          onClick={() => navigate("/profile")}
          className="flex-1 flex items-center gap-2 pr-3 text-left"
        >
          <div className={`w-7 h-7 rounded-full ${sc.iconBg} flex items-center justify-center shrink-0`}>
            <Trophy className={`w-3.5 h-3.5 ${sc.icon}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-1">
              <p className="text-[9px] font-semibold text-muted-foreground uppercase leading-tight">Priority</p>
              <p className={`text-xs font-bold ${sc.text} leading-tight`}>
                {score}<span className="text-muted-foreground font-medium">/100</span>
              </p>
            </div>
            <div className={`mt-1 h-1.5 w-full rounded-full ${sc.track} overflow-hidden`}>
              <div className={`h-full ${sc.bar} rounded-full transition-all`} style={{ width: `${score}%` }} />
            </div>
          </div>
          <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
        </button>

        {/* Rating */}
        <button
          onClick={() => navigate("/customer-reviews")}
          className="flex-1 flex items-center gap-2 pl-3 text-left"
        >
          <div className={`w-7 h-7 rounded-full ${rc.iconBg} flex items-center justify-center shrink-0`}>
            <Star className={`w-3.5 h-3.5 ${rc.icon} fill-current`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-1">
              <p className="text-[9px] font-semibold text-muted-foreground uppercase leading-tight">Rating</p>
              <p className={`text-xs font-bold ${rc.text} leading-tight`}>{rate.toFixed(1)} ★</p>
            </div>
            <div className={`mt-1 h-1.5 w-full rounded-full ${rc.track} overflow-hidden`}>
              <div className={`h-full ${rc.bar} rounded-full transition-all`} style={{ width: `${ratePct}%` }} />
            </div>
          </div>
          <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
        </button>
      </div>
    </Card>
  );
}
