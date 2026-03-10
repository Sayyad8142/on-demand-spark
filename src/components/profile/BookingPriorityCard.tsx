import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { WorkerPriorityMetrics } from "@/hooks/useWorkerPriorityMetrics";
import { TrendingUp, Briefcase, Clock, CheckCircle2, Star, Zap } from "lucide-react";

interface BookingPriorityCardProps {
  metrics: WorkerPriorityMetrics;
}

function getAcceptanceColor(rate: number): string {
  if (rate >= 85) return "bg-green-500";
  if (rate >= 60) return "bg-orange-500";
  return "bg-red-500";
}

function getAcceptanceLabel(rate: number): string {
  if (rate >= 85) return "Excellent";
  if (rate >= 60) return "Needs Improvement";
  return "Low – Accept More!";
}

export default function BookingPriorityCard({ metrics }: BookingPriorityCardProps) {
  const scoreColor =
    metrics.priorityScore >= 70
      ? "text-green-600"
      : metrics.priorityScore >= 40
      ? "text-orange-500"
      : "text-red-500";

  return (
    <Card className="border-0 shadow-lg overflow-hidden">
      {/* Score header */}
      <div className="bg-gradient-to-r from-primary/10 to-primary/5 px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-sm">Booking Priority</h3>
              <p className="text-[11px] text-muted-foreground">
                Higher score = more bookings
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className={`text-3xl font-extrabold ${scoreColor}`}>
              {metrics.priorityScore}
            </span>
            <span className="text-sm text-muted-foreground font-medium"> / 100</span>
          </div>
        </div>
        <Progress
          value={metrics.priorityScore}
          className="h-2.5 mt-3 bg-muted"
          indicatorClassName="bg-primary rounded-full"
        />
      </div>

      <CardContent className="pt-4 pb-5 space-y-4">
        {/* Completed Jobs */}
        <MetricRow
          icon={<Briefcase className="w-4 h-4 text-blue-500" />}
          label="Completed Jobs (7 days)"
          value={`${metrics.completions7d} Jobs`}
          progress={Math.min((metrics.completions7d / 8) * 100, 100)}
          barColor="bg-blue-500"
        />

        {/* Online Hours */}
        <MetricRow
          icon={<Clock className="w-4 h-4 text-violet-500" />}
          label="Online Hours (7 days)"
          value={`${metrics.onlineHours7d} Hours`}
          progress={Math.min((metrics.onlineHours7d / 10) * 100, 100)}
          barColor="bg-violet-500"
        />

        {/* Acceptance Rate */}
        <MetricRow
          icon={<CheckCircle2 className="w-4 h-4 text-green-500" />}
          label="Acceptance Rate"
          value={`${metrics.acceptanceRate}%`}
          badge={getAcceptanceLabel(metrics.acceptanceRate)}
          progress={metrics.acceptanceRate}
          barColor={getAcceptanceColor(metrics.acceptanceRate)}
        />

        {/* Rating */}
        <MetricRow
          icon={<Star className="w-4 h-4 text-amber-500 fill-amber-500" />}
          label="Rating"
          value={`${metrics.rating.toFixed(1)} ★`}
          progress={(metrics.rating / 5) * 100}
          barColor="bg-amber-500"
        />

        {/* Recent Activity */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
            <Zap className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-medium text-foreground">Recent Activity</p>
          </div>
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              metrics.isRecentlyActive
                ? "bg-green-100 text-green-700"
                : "bg-red-100 text-red-600"
            }`}
          >
            {metrics.isRecentlyActive ? "Active Recently" : "Offline Often"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricRow({
  icon,
  label,
  value,
  badge,
  progress,
  barColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  badge?: string;
  progress: number;
  barColor: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
          {icon}
        </div>
        <div className="flex-1">
          <p className="text-xs font-medium text-foreground">{label}</p>
        </div>
        <div className="text-right flex items-center gap-2">
          {badge && (
            <span className="text-[10px] font-medium text-muted-foreground">
              {badge}
            </span>
          )}
          <span className="text-sm font-bold">{value}</span>
        </div>
      </div>
      <Progress
        value={progress}
        className="h-1.5 bg-muted ml-11"
        indicatorClassName={`${barColor} rounded-full`}
      />
    </div>
  );
}
