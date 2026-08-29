import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Trophy, Star, Zap, IndianRupee, TrendingUp, HelpCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface LeaderboardEntry {
  id: string;
  rank: number;
  full_name: string;
  photo_url: string | null;
  rating: number;
  priority_score: number;
  level: string;
  jobsToday: number;
  earningsToday: number;
  isMe: boolean;
}

interface LeaderboardData {
  community: string;
  leaderboard: LeaderboardEntry[];
  updatedAt: string;
}

export default function BookingLeaderboard() {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLeaderboard = async () => {
    try {
      const { data: result, error: invokeError } = await supabase.functions.invoke("get-worker-leaderboard");
      if (invokeError) throw invokeError;
      setData(result);
      setError(null);
    } catch (err: any) {
      console.error("Error fetching leaderboard:", err);
      setError(err.message || "Failed to load leaderboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  if (loading) return <LeaderboardSkeleton />;
  if (error || !data) return null;

  const me = data.leaderboard.find(l => l.isMe);
  const top3 = data.leaderboard.slice(0, 3);
  const others = data.leaderboard.slice(3, 10); // Show top 10 total

  return (
    <div className="space-y-4">
      {/* Your Rank Card */}
      {me && (
        <Card className="overflow-hidden border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-background shadow-md">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-sm">Your Rank — #{me.rank}</h3>
              </div>
              <LevelBadge level={me.level} />
            </div>

            <div className="flex items-center gap-3 mb-4">
<div className="w-12 h-12 rounded-full bg-muted overflow-hidden border-2 border-white shadow-sm">
                {me.photo_url ? (
                  <img src={me.photo_url} alt={me.full_name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-lg font-bold text-muted-foreground bg-primary/10">
                    {me.full_name?.[0]}
                  </div>
                )}
              </div>
              <div>
                <p className="font-bold text-base leading-none mb-1">{me.full_name}</p>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                    <span className="text-xs font-bold">{me.rating.toFixed(1)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Zap className="w-3 h-3 fill-primary text-primary" />
                    <span className="text-xs font-bold">{me.priority_score}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="bg-white/50 dark:bg-black/20 p-2 rounded-xl text-center">
                <p className="text-[10px] text-muted-foreground font-semibold uppercase">Jobs Today</p>
                <p className="text-sm font-bold">{me.jobsToday}</p>
              </div>
              <div className="bg-white/50 dark:bg-black/20 p-2 rounded-xl text-center">
                <p className="text-[10px] text-muted-foreground font-semibold uppercase">Earned Today</p>
                <p className="text-sm font-bold text-green-600 flex items-center justify-center">
                  <IndianRupee className="w-3 h-3" />
                  {me.earningsToday}
                </p>
              </div>
            </div>

            <p className="text-[10px] text-muted-foreground italic text-center">
              "Higher performance can improve your booking priority."
            </p>
          </div>
        </Card>
      )}

      {/* Today's Top Workers */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-bold flex items-center gap-1.5">
            🏆 Today's Top Workers
          </h2>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="w-3.5 h-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="text-[10px] max-w-[200px]">
                Workers in your community ranked by Priority Score, Rating, and Performance.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="space-y-2">
          {top3.map((w, i) => (
            <WorkerRow key={w.id} worker={w} medal={i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"} />
          ))}
          
          {others.map((w) => (
            <WorkerRow key={w.id} worker={w} />
          ))}
        </div>
      </div>
    </div>
  );
}

function WorkerRow({ worker, medal }: { worker: LeaderboardEntry; medal?: string }) {
  return (
    <div className={`flex items-center justify-between p-2.5 rounded-xl border ${worker.isMe ? 'bg-primary/10 border-primary/30' : 'bg-card border-border'} shadow-sm`}>
      <div className="flex items-center gap-3">
        <span className="text-base w-6 text-center font-bold">
          {medal || `#${worker.rank}`}
        </span>
<div className="w-9 h-9 rounded-full bg-muted overflow-hidden shrink-0">
          {worker.photo_url ? (
            <img src={worker.photo_url} alt={worker.full_name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-sm font-bold text-muted-foreground bg-primary/5">
              {worker.full_name?.[0]}
            </div>
          )}
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <p className={`text-xs font-bold ${worker.isMe ? 'text-primary' : ''}`}>
              {worker.isMe ? 'YOU' : worker.full_name}
            </p>
            <LevelBadge level={worker.level} size="xs" />
          </div>
          <div className="flex items-center gap-2 mt-0.5 opacity-80">
            <div className="flex items-center gap-0.5">
              <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
              <span className="text-[10px] font-bold">{worker.rating.toFixed(1)}</span>
            </div>
            <div className="flex items-center gap-0.5">
              <Zap className="w-2.5 h-2.5 fill-primary text-primary" />
              <span className="text-[10px] font-bold">Prio {worker.priority_score}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="text-right">
        <p className="text-[10px] font-bold text-foreground leading-none">{worker.jobsToday} Jobs</p>
        <p className="text-[11px] font-extrabold text-green-600 flex items-center justify-end mt-0.5">
          <IndianRupee className="w-2.5 h-2.5" />
          {worker.earningsToday}
        </p>
      </div>
    </div>
  );
}

function LevelBadge({ level, size = "sm" }: { level: string; size?: "sm" | "xs" }) {
  const colors: Record<string, string> = {
    Elite: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 border-emerald-200",
    Pro: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 border-blue-200",
    Rising: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400 border-orange-200",
    Standard: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400 border-slate-200"
  };

  const icons: Record<string, string> = {
    Elite: "🏆",
    Pro: "⭐",
    Rising: "🔥",
    Standard: "⚡"
  };

  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[9px] font-extrabold uppercase tracking-tight ${colors[level] || colors.Standard}`}>
      <span>{icons[level] || icons.Standard}</span>
      {level}
    </span>
  );
}

function LeaderboardSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-40 w-full rounded-2xl" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-32 ml-1" />
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
