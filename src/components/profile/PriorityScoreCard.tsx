import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Trophy, Star, Lightbulb } from "lucide-react";

interface PriorityScoreCardProps {
  worker: {
    priority_score?: number | null;
    rating?: number | null;
    admin_override_rating?: number | null;
    total_ratings?: number | null;
  } | null;
}

export default function PriorityScoreCard({ worker }: PriorityScoreCardProps) {
  const score = Math.round((worker?.priority_score ?? 0) * 10) / 10;
  const effectiveRating = worker?.admin_override_rating ?? worker?.rating ?? 0;
  const totalRatings = worker?.total_ratings ?? 0;

  let tierLabel = "Getting Started";
  let tierColor = "text-muted-foreground";
  let encouragement = "Keep accepting bookings to grow your score and get more jobs.";

  if (score >= 75) {
    tierLabel = "Top Performer";
    tierColor = "text-emerald-600 dark:text-emerald-400";
    encouragement = "Excellent! You're among the first to receive new bookings.";
  } else if (score >= 50) {
    tierLabel = "Strong Score";
    tierColor = "text-blue-600 dark:text-blue-400";
    encouragement = "Great job! Keep it up to reach Top Performer status.";
  } else if (score >= 25) {
    tierLabel = "Building Up";
    tierColor = "text-amber-600 dark:text-amber-400";
    encouragement = "Maintain great ratings and keep completing jobs to receive more bookings earlier.";
  }

  return (
    <Card className="border-0 shadow-lg overflow-hidden">
      <CardHeader className="pb-3 bg-gradient-to-br from-primary/10 to-primary/5">
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="w-5 h-5 text-primary" />
          Priority Score
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        <div>
          <div className="flex items-end justify-between mb-2">
            <div>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-extrabold text-primary">{score}</span>
                <span className="text-sm text-muted-foreground">/ 100</span>
              </div>
              <p className={`text-xs font-semibold ${tierColor} mt-0.5`}>{tierLabel}</p>
            </div>
          </div>
          <Progress value={Math.min(score, 100)} className="h-2" />
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed bg-muted/50 rounded-lg p-3">
          Workers with better ratings and priority scores receive booking alerts earlier.
        </p>

        <div className="grid grid-cols-1 gap-2">
          <div className="bg-muted/40 rounded-lg p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                Your Rating
              </p>
              <p className="text-base font-bold text-foreground">
                {effectiveRating > 0 ? `${effectiveRating.toFixed(1)} ★` : '—'}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {totalRatings > 0 ? `${totalRatings} reviews` : 'No reviews yet'}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
