import { displayText, useWorkerLanguage } from "@/i18n/display";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Trophy, ChevronRight } from "lucide-react";

interface WorkerLeaderboardCardProps {
  currentWorkerId: string;
  community: string;
  serviceTypes: string[];
  isAvailable?: boolean;
}

// The phone may read only the worker's own row, so a community ranking cannot be built here.
// Honest pointer to the server-backed Worker Ranking page instead of a self-only "#1".
export default function WorkerLeaderboardCard(_props: WorkerLeaderboardCardProps) {
  useWorkerLanguage();
  return (
    <Card className="overflow-hidden border-2 border-primary/10">
      <Link to="/leaderboard" className="flex items-center justify-between gap-2 p-3">
        <div className="flex items-center gap-2 min-w-0">
          <Trophy className="w-5 h-5 text-primary shrink-0" />
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-foreground leading-tight">{displayText("🏆 Top Worker Leaderboard")}</h3>
            <p className="text-[10px] text-muted-foreground">{displayText("Community ranking is not shown on Home. Open Worker Ranking to see it.")}</p>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
      </Link>
    </Card>
  );
}
