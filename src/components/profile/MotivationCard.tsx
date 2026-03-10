import { Card, CardContent } from "@/components/ui/card";
import { Target } from "lucide-react";
import { WorkerPriorityMetrics } from "@/hooks/useWorkerPriorityMetrics";

interface MotivationCardProps {
  metrics: WorkerPriorityMetrics;
}

export default function MotivationCard({ metrics }: MotivationCardProps) {
  const remainingJobs = Math.max(8 - metrics.completions7d, 0);

  let message: string;
  if (metrics.priorityScore >= 80) {
    message =
      "Amazing work! You're a top performer. Keep accepting bookings to maintain your rank! 🚀";
  } else if (remainingJobs > 0) {
    message = `Complete ${remainingJobs} more booking${remainingJobs > 1 ? "s" : ""} this week to increase your booking priority and receive more booking alerts.`;
  } else {
    message =
      "Great progress! Stay online and accept requests quickly to climb higher in the rankings.";
  }

  return (
    <Card className="border-0 shadow-lg bg-primary/5 border-l-4 !border-l-primary">
      <CardContent className="py-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
            <Target className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground mb-1">Next Target</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {message}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
