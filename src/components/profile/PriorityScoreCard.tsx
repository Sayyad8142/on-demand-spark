import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Trophy, Star, CheckCircle2, Briefcase, Clock, Lightbulb } from "lucide-react";

interface PriorityScoreCardProps {
  worker: {
    priority_score?: number | null;
    rating?: number | null;
    admin_override_rating?: number | null;
    total_ratings?: number | null;
    last_7_days_completed_bookings?: number | null;
    last_7_days_online_hours?: number | null;
    acceptance_rate_7d?: number | null;
    score_reason?: string | null;
  } | null;
}

function friendlyReason(reason: string | null | undefined): string | null {
  if (!reason) return null;
  const cleaned = reason
    .replace(/score\s*=\s*[\d.]+/gi, '')
    .replace(/base\s*=\s*[\d.]+/gi, '')
    .replace(/[_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length < 4) return null;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export default function PriorityScoreCard({ worker }: PriorityScoreCardProps) {
  const score = Math.round((worker?.priority_score ?? 0) * 10) / 10;
  const effectiveRating = worker?.admin_override_rating ?? worker?.rating ?? 0;
  const totalRatings = worker?.total_ratings ?? 0;
  const completed7d = worker?.last_7_days_completed_bookings ?? 0;
  const onlineHours7d = worker?.last_7_days_online_hours ?? 0;
  const reason = friendlyReason(worker?.score_reason);

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
    encouragement = "Keep improving your rating and acceptance to receive more bookings earlier.";
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
          Your priority score helps decide how early you receive booking alerts.
          <span className="block mt-1 font-medium text-foreground">
            Higher score = more chance to get bookings first.
          </span>
        </p>

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            What affects your score
          </p>
          <div className="grid grid-cols-2 gap-2">
            <FactorItem
              icon={<Star className="w-4 h-4 text-amber-500" />}
              label="Rating"
              value={effectiveRating > 0 ? `${effectiveRating.toFixed(1)} ★` : '—'}
              sub={totalRatings > 0 ? `${totalRatings} reviews` : 'No reviews yet'}
            />
            <FactorItem
              icon={<CheckCircle2 className="w-4 h-4 text-green-500" />}
              label="Acceptance"
              value="—"
              sub="Accept quickly"
            />
            <FactorItem
              icon={<Briefcase className="w-4 h-4 text-blue-500" />}
              label="Recent Jobs"
              value={`${completed7d}`}
              sub="Last 7 days"
            />
            <FactorItem
              icon={<Clock className="w-4 h-4 text-purple-500" />}
              label="Online Time"
              value={`${onlineHours7d.toFixed(1)}h`}
              sub="Last 7 days"
            />
          </div>
        </div>

        {reason && (
          <div className="text-xs bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg p-3 text-blue-900 dark:text-blue-200">
            <span className="font-semibold">Note: </span>{reason}
          </div>
        )}

        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Lightbulb className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
              How to improve your score
            </p>
          </div>
          <ul className="space-y-1 text-xs text-amber-900 dark:text-amber-200">
            <li className="flex items-start gap-1.5">
              <span className="text-amber-500 mt-0.5">•</span>
              <span>Maintain good customer rating</span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-amber-500 mt-0.5">•</span>
              <span>Accept bookings quickly</span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-amber-500 mt-0.5">•</span>
              <span>Complete more jobs</span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-amber-500 mt-0.5">•</span>
              <span>Stay active regularly</span>
            </li>
          </ul>
          <p className="text-xs text-amber-800 dark:text-amber-300 mt-2 italic">
            {encouragement}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function FactorItem({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="bg-muted/40 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 mb-0.5">
        {icon}
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          {label}
        </span>
      </div>
      <p className="text-sm font-bold text-foreground">{value}</p>
      <p className="text-[10px] text-muted-foreground">{sub}</p>
    </div>
  );
}
