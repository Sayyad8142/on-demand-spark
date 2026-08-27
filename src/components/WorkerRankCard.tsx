import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Trophy, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

export default function WorkerRankCard() {
  const navigate = useNavigate();
  const [rank, setRank] = useState<number | null>(null);
  const [level, setLevel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRank = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("get-worker-leaderboard");
        if (error) throw error;
        const me = data?.leaderboard?.find((l: any) => l.isMe);
        if (me) {
          setRank(me.rank);
          setLevel(me.level);
        }
      } catch (err) {
        console.error("Error fetching worker rank:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchRank();
  }, []);

  if (loading) return <Skeleton className="h-16 w-full rounded-2xl" />;

  return (
    <Card
      className="p-4 flex items-center justify-between cursor-pointer border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-background shadow-md active:scale-[0.99] transition-transform"
      onClick={() => navigate("/leaderboard")}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
          <Trophy className="w-5 h-5 text-primary" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground font-semibold">Your Rank</p>
          <p className="text-base font-bold">
            {rank ? `#${rank}` : "—"}
            {level && (
              <span className="ml-2 text-[10px] font-extrabold uppercase text-primary align-middle">
                {level}
              </span>
            )}
          </p>
        </div>
      </div>
      <ChevronRight className="w-5 h-5 text-muted-foreground" />
    </Card>
  );
}
