import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Trophy, Star, ChevronRight } from "lucide-react";

interface HomePerformanceCardProps {
  priorityScore?: number | null;
  rating?: number | null;
  totalRatings?: number | null;
}

function scoreColor(score: number) {
  if (score > 70) return { text: "text-emerald-600", bar: "bg-emerald-500", iconBg: "bg-emerald-50", icon: "text-emerald-600" };
  if (score >= 40) return { text: "text-amber-600", bar: "bg-amber-500", iconBg: "bg-amber-50", icon: "text-amber-600" };
  return { text: "text-red-600", bar: "bg-red-500", iconBg: "bg-red-50", icon: "text-red-600" };
}

function ratingColor(r: number) {
  if (r >= 4.5) return { text: "text-emerald-600", bar: "bg-emerald-500", iconBg: "bg-emerald-50", icon: "text-emerald-600" };
  if (r >= 4.0) return { text: "text-amber-600", bar: "bg-amber-500", iconBg: "bg-amber-50", icon: "text-amber-600" };
  return { text: "text-red-600", bar: "bg-red-500", iconBg: "bg-red-50", icon: "text-red-600" };
}

export default function HomePerformanceCard({ priorityScore, rating, totalRatings }: HomePerformanceCardProps) {
  const navigate = useNavigate();
  const score = Math.max(0, Math.min(100, Math.round(priorityScore ?? 0)));
  const hasRatings = (totalRatings ?? 0) > 0 && (rating ?? 0) > 0;
  const rate = hasRatings ? Number(rating) : 5;
  const sc = scoreColor(score);
  const rc = ratingColor(rate);

  return (
    <Card className="p-4 space-y-3 rounded-2xl">
      {/* Priority Score */}
      <button
        onClick={() => navigate("/profile")}
        className="w-full text-left group"
      >
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-full ${sc.iconBg} flex items-center justify-center shrink-0`}>
            <Trophy className={`w-4.5 h-4.5 ${sc.icon}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Priority Score</p>
              <div className="flex items-center gap-1">
                <span className={`text-sm font-bold ${sc.text}`}>{score}<span className="text-muted-foreground font-medium">/100</span></span>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
              </div>
            </div>
            <Progress value={score} className="h-1.5 mt-1.5" indicatorClassName={sc.bar} />
            <p className="text-[11px] text-muted-foreground mt-1">&nbsp;</p>
          </div>
        </div>
      </button>

      <div className="h-px bg-border" />

      {/* Rating */}
      <button
        onClick={() => navigate("/customer-reviews")}
        className="w-full text-left group"
      >
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-full ${rc.iconBg} flex items-center justify-center shrink-0`}>
            <Star className={`w-4.5 h-4.5 ${rc.icon} fill-current`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Rating</p>
              <div className="flex items-center gap-1">
                <span className={`text-sm font-bold ${rc.text}`}>
                  {rate.toFixed(1)} ★
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
              </div>
            </div>
            <Progress value={(rate / 5) * 100} className="h-1.5 mt-1.5" indicatorClassName={rc.bar} />
            <p className="text-[11px] text-muted-foreground mt-1">
              {hasRatings ? `${rate.toFixed(1)} ★ · ${totalRatings} ratings` : "\u00A0"}
            </p>
          </div>
        </div>
      </button>
    </Card>
  );
}
