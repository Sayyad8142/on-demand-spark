import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Trophy, IndianRupee, Briefcase } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

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
  const topWorkers = data.leaderboard.slice(0, 10);

  return (
    <div className="space-y-5">
      {/* Your Rank Card */}
      {me && (
        <Card className="overflow-hidden border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-background shadow-md">
          <div className="p-5 text-center">
            <div className="inline-flex items-center gap-2 mb-3 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold">
              <Trophy className="w-4 h-4" />
              <span>Your Rank</span>
            </div>

            <div className="relative inline-block mb-3">
              <div className="w-24 h-24 rounded-full bg-muted overflow-hidden border-4 border-white shadow-lg mx-auto">
                {me.photo_url ? (
                  <img src={me.photo_url} alt={me.full_name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-muted-foreground bg-primary/10">
                    {me.full_name?.[0]}
                  </div>
                )}
              </div>
              <div className="absolute -bottom-1 -right-1 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-extrabold shadow-md border-2 border-white">
                #{me.rank}
              </div>
            </div>

            <p className="font-bold text-lg leading-tight mb-4">{me.full_name}</p>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/60 dark:bg-black/20 p-3 rounded-2xl text-center">
                <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                  <Briefcase className="w-4 h-4" />
                  <span className="text-[11px] font-semibold">Jobs Today</span>
                </div>
                <p className="text-xl font-extrabold">{me.jobsToday}</p>
              </div>
              <div className="bg-white/60 dark:bg-black/20 p-3 rounded-2xl text-center">
                <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                  <IndianRupee className="w-4 h-4" />
                  <span className="text-[11px] font-semibold">Money Today</span>
                </div>
                <p className="text-xl font-extrabold text-green-600 flex items-center justify-center">
                  <IndianRupee className="w-4 h-4" />
                  {me.earningsToday}
                </p>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Today's Top Workers */}
      <div className="space-y-3">
        <h2 className="text-base font-bold px-1 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-500" />
          Top Workers Today
        </h2>

        <div className="grid grid-cols-2 gap-3">
          {topWorkers.map((w, i) => (
            <WorkerCard key={w.id} worker={w} rank={i + 1} />
          ))}
        </div>
      </div>
    </div>
  );
}

function WorkerCard({ worker, rank }: { worker: LeaderboardEntry; rank: number }) {
  const isTop3 = rank <= 3;

  return (
    <Card className={`p-3 text-center relative overflow-hidden ${
      worker.isMe
        ? 'border-2 border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
        : 'border border-border bg-card'
    }`}>
      {isTop3 && (
        <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500" />
      )}

      <div className="absolute top-2 right-2 w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-extrabold">
        #{rank}
      </div>

      <div className="w-16 h-16 rounded-full bg-muted overflow-hidden border-2 border-white shadow-sm mx-auto mb-2">
        {worker.photo_url ? (
          <img src={worker.photo_url} alt={worker.full_name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-lg font-bold text-muted-foreground bg-primary/10">
            {worker.full_name?.[0]}
          </div>
        )}
      </div>

      <p className="font-bold text-sm leading-tight mb-1 truncate px-1">
        {worker.isMe ? 'You' : worker.full_name}
      </p>

      <div className="space-y-1 mt-2">
        <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
          <Briefcase className="w-3 h-3" />
          <span>{worker.jobsToday} jobs</span>
        </div>
        <div className="flex items-center justify-center gap-1 text-sm font-extrabold text-green-600">
          <IndianRupee className="w-3 h-3" />
          <span>{worker.earningsToday}</span>
        </div>
      </div>
    </Card>
  );
}

function LeaderboardSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-72 w-full rounded-2xl" />
      <Skeleton className="h-5 w-40 ml-1" />
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4].map(i => (
          <Skeleton key={i} className="h-44 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
