import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Trophy, Star, HelpCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface LeaderboardWorker {
  id: string;
  first_name: string;
  photo_url: string | null;
  rating: number;
  priority_score: number;
}

interface WorkerLeaderboardCardProps {
  currentWorkerId: string;
  community: string;
  serviceTypes: string[];
  isAvailable?: boolean;
}

export default function WorkerLeaderboardCard({
  currentWorkerId,
  community,
  serviceTypes,
  isAvailable = false,
}: WorkerLeaderboardCardProps) {
  const [workers, setWorkers] = useState<LeaderboardWorker[]>([]);
  const [currentUserRank, setCurrentUserRank] = useState<number | null>(null);
  const [currentUserScore, setCurrentUserScore] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const fetchLeaderboard = async () => {
    if (!community || !serviceTypes?.length) return;

    try {
      // Use any to bypass TS generation issues for specific columns
      const { data, error } = await (supabase
        .from("workers") as any)
        .select("id, first_name, photo_url, rating, priority_score, total_bookings_completed, is_available")
        .eq("is_available", true)
        .eq("community", community)
        .contains("service_types", [serviceTypes[0]])
        .eq("is_blocked", false)
        .order("priority_score", { ascending: false })
        .order("rating", { ascending: false })
        .order("total_bookings_completed", { ascending: false })
        .limit(50);

      if (error) throw error;

      if (data) {
        setWorkers(data);
        const rank = data.findIndex((w: any) => w.id === currentWorkerId);
        if (rank !== -1) {
          setCurrentUserRank(rank + 1);
          setCurrentUserScore(data[rank].priority_score || 0);
        }
      }
    } catch (err) {
      console.error("Error fetching leaderboard:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
    const interval = setInterval(fetchLeaderboard, 60000); // Refresh every 60s
    return () => clearInterval(interval);
  }, [community, serviceTypes, currentWorkerId]);

  if (loading || workers.length === 0) return null;

  const top3 = workers.slice(0, 3);
  const isTop1 = currentUserRank === 1;
  const isTop10 = currentUserRank !== null && currentUserRank <= 10;

  const getMedal = (index: number) => {
    if (index === 0) return "🥇";
    if (index === 1) return "🥈";
    if (index === 2) return "🥉";
    return `#${index + 1}`;
  };

  return (
    <Card className="overflow-hidden border-2 border-primary/10">
      <div className="bg-primary/5 p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary" />
          <div>
            <h3 className="text-xs font-bold text-foreground leading-tight">
              🏆 Top Worker Leaderboard
            </h3>
            <p className="text-[10px] text-muted-foreground">
              Improve your score to receive bookings earlier.
            </p>
          </div>
        </div>
        
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <HelpCircle className="w-4 h-4 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent className="max-w-[200px] p-3 text-xs">
              <p className="font-bold mb-1">How is this calculated?</p>
              <p>Your Priority Score improves with high ratings, completing bookings, and accepting requests quickly.</p>
              <p className="mt-1">Cancellations and late arrivals decrease your score.</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {!isAvailable && (
        <div className="mx-3 mt-3 px-3 py-2 bg-amber-50 rounded-lg border border-amber-100 flex items-center gap-2">
          <p className="text-[10px] text-amber-800 font-medium">
            You must be <span className="font-bold">Available</span> to be ranked on the leaderboard.
          </p>
        </div>
      )}

      <div className="p-3 space-y-3">
        {top3.map((w, i) => (
          <div key={w.id} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base w-6">{getMedal(i)}</span>
              <div className="w-8 h-8 rounded-full bg-muted overflow-hidden">
                {w.photo_url ? (
                  <img src={w.photo_url} alt={w.first_name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs font-bold text-muted-foreground">
                    {w.first_name?.[0]}
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs font-bold">{w.first_name}</p>
                <div className="flex items-center gap-1">
                  <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                  <span className="text-[10px] text-muted-foreground">{(w.rating || 5).toFixed(2)}</span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-medium text-muted-foreground">Priority Score</p>
              <p className="text-xs font-bold text-primary">{w.priority_score || 0}/50</p>
            </div>
          </div>
        ))}

        {currentUserRank && currentUserRank > 3 && (
          <>
            <div className="border-t border-dashed my-2" />
            <div className="bg-primary px-3 py-2 rounded-lg text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold">You</span>
                <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded">Rank #{currentUserRank}</span>
              </div>
              <div className="text-right">
                <p className="text-[10px] opacity-80">Priority Score</p>
                <p className="text-xs font-bold">{currentUserScore}/50</p>
              </div>
            </div>
          </>
        )}

        <div className="pt-2">
          {isTop1 ? (
            <p className="text-[11px] font-bold text-primary text-center">
              👑 Congratulations! You're currently receiving booking offers before everyone else.
            </p>
          ) : isTop10 ? (
            <p className="text-[11px] font-bold text-primary text-center">
              🎉 You're now among the Top 10 workers! Keep maintaining your performance.
            </p>
          ) : currentUserRank ? (
            <p className="text-[11px] text-muted-foreground text-center">
              You are currently Rank #{currentUserRank}. Reach the Top 10 to receive booking opportunities sooner.
            </p>
          ) : null}
          <p className="text-[9px] text-muted-foreground text-center mt-1">
            Higher priority means you receive booking offers before others.
          </p>
        </div>
      </div>
    </Card>
  );
}
