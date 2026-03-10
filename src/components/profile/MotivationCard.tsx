import { Card, CardContent } from "@/components/ui/card";
import { Target } from "lucide-react";
import { WorkerPriorityMetrics } from "@/hooks/useWorkerPriorityMetrics";
import { useTranslation } from "react-i18next";

interface MotivationCardProps {
  metrics: WorkerPriorityMetrics;
}

export default function MotivationCard({ metrics }: MotivationCardProps) {
  const { t } = useTranslation();
  const remainingJobs = Math.max(8 - metrics.completions7d, 0);

  let message: string;
  if (metrics.priorityScore >= 80) {
    message = t("profile.motivation.topPerformer");
  } else if (remainingJobs > 0) {
    message = t("profile.motivation.completeMore", { count: remainingJobs });
  } else {
    message = t("profile.motivation.greatProgress");
  }

  return (
    <Card className="border-0 shadow-lg bg-primary/5 border-l-4 !border-l-primary">
      <CardContent className="py-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
            <Target className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground mb-1">
              {t("profile.motivation.nextTarget")}
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {message}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
