import { Card, CardContent } from "@/components/ui/card";
import { Trophy } from "lucide-react";
import { useTranslation } from "react-i18next";

interface WorkerRankCardProps {
  rank: number | null;
  totalWorkers: number | null;
}

export default function WorkerRankCard({ rank, totalWorkers }: WorkerRankCardProps) {
  const { t } = useTranslation();

  if (rank === null || totalWorkers === null || totalWorkers === 0) {
    return null;
  }

  const percentile = Math.round(((totalWorkers - rank) / totalWorkers) * 100);

  return (
    <Card className="border-0 shadow-lg">
      <CardContent className="py-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-500 flex items-center justify-center shadow-md">
            <Trophy className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t("profile.rank.title")}
            </p>
            <p className="text-xl font-extrabold">
              🏆 Rank #{rank}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                {t("profile.rank.rankOf", { total: totalWorkers })}
              </span>
            </p>
          </div>
        </div>
        {percentile >= 50 && (
          <p className="text-xs text-primary font-medium mt-2 ml-16">
            {t("profile.rank.topPercent", { percent: 100 - percentile })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
