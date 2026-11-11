import { displayText, useWorkerLanguage } from "@/i18n/display";
import { Card } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Info, Star, Trophy } from "lucide-react";

interface HomePerformanceCardProps {
  priorityScore?: number | null;
  rating?: number | null;
  totalRatings?: number | null;
}

function InfoTip({ label, text }: { label: string; text: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label={label} className="-m-2 p-2 text-muted-foreground">
          <Info className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 text-sm leading-relaxed">{text}</PopoverContent>
    </Popover>
  );
}

export default function HomePerformanceCard({ priorityScore, rating, totalRatings }: HomePerformanceCardProps) {
  useWorkerLanguage();
  // Values are shown exactly as before: score clamped 0–100, rating 5.0 for new workers.
  const score = Math.max(0, Math.min(100, Math.round(priorityScore ?? 0)));
  const hasRatings = (totalRatings ?? 0) > 0 && (rating ?? 0) > 0;
  const rate = hasRatings ? Number(rating) : 5;

  return (
    <div className="grid grid-cols-2 gap-2">
      <Card className="p-3 rounded-2xl">
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Trophy className="h-4 w-4 text-primary" />
            </span>
            <span className="text-xs font-semibold text-muted-foreground leading-tight">{displayText("Your Work Priority")}</span>
          </div>
          <InfoTip label={displayText("About work priority")} text={displayText("Score out of 100. Higher priority means you receive booking offers before others.")} />
        </div>
        <p className="mt-2 text-2xl font-bold text-foreground">
          {score}<span className="text-sm font-medium text-muted-foreground">/100</span>
        </p>
        <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-primary" style={{ width: `${score}%` }} />
        </div>
      </Card>

      <Card className="p-3 rounded-2xl">
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Star className="h-4 w-4 text-primary fill-current" />
            </span>
            <span className="text-xs font-semibold text-muted-foreground leading-tight">{displayText("Your Rating")}</span>
          </div>
          <InfoTip label={displayText("About your rating")} text={displayText("Average of the stars customers gave you after bookings. New workers start at 5.0.")} />
        </div>
        <p className="mt-2 text-2xl font-bold text-foreground">
          {rate.toFixed(1)} <span className="text-primary">★</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {hasRatings ? displayText("{{count}} ratings", { count: totalRatings ?? 0 }) : displayText("No ratings yet")}
        </p>
      </Card>
    </div>
  );
}
