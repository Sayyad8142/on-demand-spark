import { Star } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface RatingBreakdownProps {
  ratings: {
    5: number;
    4: number;
    3: number;
    2: number;
    1: number;
  };
  totalRatings: number;
}

export default function RatingBreakdown({ ratings, totalRatings }: RatingBreakdownProps) {
  if (totalRatings === 0) {
    return (
      <div className="text-center py-4">
        <div className="flex items-center justify-center gap-1 mb-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <Star key={i} className="w-5 h-5 fill-amber-400 text-amber-400" />
          ))}
        </div>
        <p className="text-sm font-semibold">5.0</p>
        <p className="text-xs text-muted-foreground">Default rating for new workers</p>
      </div>
    );
  }

  const getPercentage = (count: number) => {
    return totalRatings > 0 ? Math.round((count / totalRatings) * 100) : 0;
  };

  const ratingLevels = [5, 4, 3, 2, 1] as const;

  return (
    <div className="space-y-2">
      {ratingLevels.map((level) => {
        const count = ratings[level] || 0;
        const percentage = getPercentage(count);
        
        return (
          <div key={level} className="flex items-center gap-3">
            <div className="flex items-center gap-1 min-w-[60px]">
              <span className="text-sm font-medium w-3">{level}</span>
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
            </div>
            <div className="flex-1">
              <Progress 
                value={percentage} 
                className="h-2"
                indicatorClassName={
                  level === 5 ? "bg-green-500" :
                  level === 4 ? "bg-lime-500" :
                  level === 3 ? "bg-yellow-500" :
                  level === 2 ? "bg-orange-500" :
                  "bg-red-500"
                }
              />
            </div>
            <div className="flex items-center gap-2 min-w-[70px] justify-end">
              <span className="text-xs text-muted-foreground">{percentage}%</span>
              <span className="text-xs text-muted-foreground">({count})</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
