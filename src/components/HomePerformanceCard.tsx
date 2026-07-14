import { Card } from "@/components/ui/card";
import { Trophy, Star } from "lucide-react";

interface HomePerformanceCardProps {
  priorityScore?: number | null;
  rating?: number | null;
  totalRatings?: number | null;
}

function scoreColor(score: number) {
  if (score > 70) return { text: "text-emerald-700", iconBg: "bg-emerald-500" };
  if (score >= 40) return { text: "text-amber-700", iconBg: "bg-amber-500" };
  return { text: "text-red-700", iconBg: "bg-red-500" };
}

function ratingColor(r: number) {
  if (r >= 4.5) return { text: "text-emerald-700", iconBg: "bg-emerald-500" };
  if (r >= 4.0) return { text: "text-amber-700", iconBg: "bg-amber-500" };
  return { text: "text-red-700", iconBg: "bg-red-500" };
}

export default function HomePerformanceCard({ priorityScore, rating, totalRatings }: HomePerformanceCardProps) {
  const score = Math.max(0, Math.min(100, Math.round(priorityScore ?? 0)));
  const hasRatings = (totalRatings ?? 0) > 0 && (rating ?? 0) > 0;
  const rate = hasRatings ? Number(rating) : 5;
  const sc = scoreColor(score);
  const rc = ratingColor(rate);

  return (
    <Card className="px-3 py-2 rounded-xl">
      <div className="flex items-center divide-x divide-border">
        <div className="flex-1 flex items-center gap-2 pr-3">
          <div className={`w-6 h-6 rounded-full ${sc.iconBg} flex items-center justify-center shrink-0`}>
            <Trophy className="w-3 h-3 text-white" />
          </div>
          <p className="text-[11px] font-semibold text-muted-foreground">Priority</p>
          <p className={`text-xs font-bold ${sc.text} ml-auto`}>
            {score}<span className="text-muted-foreground font-medium">/100</span>
          </p>
        </div>

        <div className="flex-1 flex items-center gap-2 pl-3">
          <div className={`w-6 h-6 rounded-full ${rc.iconBg} flex items-center justify-center shrink-0`}>
            <Star className="w-3 h-3 text-white fill-current" />
          </div>
          <p className="text-[11px] font-semibold text-muted-foreground">Rating</p>
          <p className={`text-xs font-bold ${rc.text} ml-auto`}>{rate.toFixed(1)} ★</p>
        </div>
      </div>
    </Card>
  );
}
