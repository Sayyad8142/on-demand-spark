import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { WorkerPriorityMetrics } from "@/hooks/useWorkerPriorityMetrics";
import { BarChart3 } from "lucide-react";
import { useTranslation } from "react-i18next";

interface WeeklyPerformanceCardProps {
  metrics: WorkerPriorityMetrics;
}

export default function WeeklyPerformanceCard({ metrics }: WeeklyPerformanceCardProps) {
  const { t } = useTranslation();

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="w-5 h-5 text-primary" />
          {t("profile.weeklyPerformance.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3">
          <StatBlock
            value={String(metrics.completions7d)}
            label={t("profile.weeklyPerformance.completedJobs")}
            progress={Math.min((metrics.completions7d / 8) * 100, 100)}
            color="bg-blue-500"
          />
          <StatBlock
            value={`${metrics.onlineHours7d} hrs`}
            label={t("profile.weeklyPerformance.onlineHours")}
            progress={Math.min((metrics.onlineHours7d / 10) * 100, 100)}
            color="bg-violet-500"
          />
          <StatBlock
            value={`${metrics.acceptanceRate}%`}
            label={t("profile.weeklyPerformance.acceptanceRate")}
            progress={metrics.acceptanceRate}
            color={metrics.acceptanceRate >= 85 ? "bg-green-500" : metrics.acceptanceRate >= 60 ? "bg-orange-500" : "bg-red-500"}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function StatBlock({
  value,
  label,
  progress,
  color,
}: {
  value: string;
  label: string;
  progress: number;
  color: string;
}) {
  return (
    <div className="text-center space-y-2">
      <p className="text-2xl font-extrabold text-foreground">{value}</p>
      <Progress
        value={progress}
        className="h-1.5 bg-muted"
        indicatorClassName={`${color} rounded-full`}
      />
      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide leading-tight">
        {label}
      </p>
    </div>
  );
}
