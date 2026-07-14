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
    <Card className="px-3 py-2 rounded-xl">
      <div className="flex items-center divide-x divide-border">
        {/* Priority Score */}
        <button
          onClick={() => navigate("/profile")}
          className="flex-1 flex items-center gap-2 pr-2 text-left"
        >
          <div className={`w-6 h-6 rounded-full ${sc.iconBg} flex items-center justify-center shrink-0`}>
            <Trophy className={`w-3 h-3 ${sc.icon}`} />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-semibold text-muted-foreground uppercase leading-tight">Priority</p>
            <p className={`text-xs font-bold ${sc.text} leading-tight`}>
              {score}<span className="text-muted-foreground font-medium">/100</span>
            </p>
          </div>
          <ChevronRight className="w-3 h-3 text-muted-foreground ml-auto" />
        </button>

        {/* Rating */}
        <button
          onClick={() => navigate("/customer-reviews")}
          className="flex-1 flex items-center gap-2 pl-2 text-left"
        >
          <div className={`w-6 h-6 rounded-full ${rc.iconBg} flex items-center justify-center shrink-0`}>
            <Star className={`w-3 h-3 ${rc.icon} fill-current`} />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-semibold text-muted-foreground uppercase leading-tight">Rating</p>
            <p className={`text-xs font-bold ${rc.text} leading-tight`}>{rate.toFixed(1)} ★</p>
          </div>
          <ChevronRight className="w-3 h-3 text-muted-foreground ml-auto" />
        </button>
      </div>
    </Card>
  );
}
