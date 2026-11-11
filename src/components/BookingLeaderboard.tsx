import { displayText, useWorkerLanguage, serviceLabel, bookingStatusLabel, displayLocale } from "@/i18n/display";
import { useState, useEffect, useMemo, useRef } from "react";
import { rankLeaderboard, summarizeReviews, LEADERBOARD_TABS, type LeaderboardTab, type ReviewStats, type RankedWorker } from "@/lib/leaderboardRanking";
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
  useWorkerLanguage();
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<LeaderboardTab>("top");
  const [slideDir, setSlideDir] = useState<"left" | "right">("left");
  const [reviews, setReviews] = useState<Map<string, ReviewStats>>(new Map());
  const touchX = useRef<number | null>(null);

  const fetchLeaderboard = async () => {
    try {
      const { data: result, error: invokeError } = await supabase.functions.invoke("get-worker-leaderboard");
      if (invokeError) throw invokeError;
      setData(result);
      setError(null);
      const ids = (result?.leaderboard ?? []).map((l: LeaderboardEntry) => l.id);
      if (ids.length) {
        const { data: rows, error: rErr } = await supabase
          .from("worker_ratings").select("worker_id, rating").in("worker_id", ids).limit(5000);
        if (!rErr && rows) setReviews(summarizeReviews(rows as { worker_id: string | null; rating: number | null }[]));
      }
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

  const switchTab = (next: LeaderboardTab) => {
    if (next === tab) return;
    setSlideDir(LEADERBOARD_TABS.indexOf(next) > LEADERBOARD_TABS.indexOf(tab) ? "left" : "right");
    setTab(next);
    fetchLeaderboard();
  };

  const ranked = useMemo(
    () => (data ? rankLeaderboard(data.leaderboard, tab, reviews) : []),
    [data, tab, reviews],
  );

  if (loading) return <LeaderboardSkeleton />;
  if (error || !data) return null;

  const me = ranked.find(l => l.isMe);
  const top3 = ranked.slice(0, 3);
  const others = ranked.slice(3);
  const tabLabels: Record<LeaderboardTab, string> = {
    top: displayText("🏆 Top Workers"),
    earners: displayText("💰 Top Earners"),
    rated: displayText("⭐ Top Rated"),
  };
  const tabHelp: Record<LeaderboardTab, string> = {
    top: displayText("Workers in your community ranked by Priority Score, Rating, and Performance."),
    earners: displayText("Ranked by earnings from completed bookings today."),
    rated: displayText("Ranked by average customer rating. More reviews wins a tie."),
  };
  const onTouchEnd = (x: number) => {
    if (touchX.current === null) return;
    const dx = x - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) < 50) return;
    const i = LEADERBOARD_TABS.indexOf(tab) + (dx < 0 ? 1 : -1);
    if (i >= 0 && i < LEADERBOARD_TABS.length) switchTab(LEADERBOARD_TABS[i]);
  };

  return (
    <div className="space-y-4">
      {/* Your Rank Card */}
      {me && (
        <Card className="overflow-hidden border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-background shadow-md">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-sm">{displayText("Your Rank — #")}{me.displayRank}</h3>
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
                <p className="text-[10px] text-muted-foreground font-semibold uppercase">{displayText("Jobs Today")}</p>
                <p className="text-sm font-bold">{me.jobsToday}</p>
              </div>
              <div className="bg-white/50 dark:bg-black/20 p-2 rounded-xl text-center">
                <p className="text-[10px] text-muted-foreground font-semibold uppercase">{displayText("Earned Today")}</p>
                <p className="text-sm font-bold text-green-600 flex items-center justify-center">
                  <IndianRupee className="w-3 h-3" />
                  {me.earningsToday}
                </p>
              </div>
            </div>

            <p className="text-[10px] text-muted-foreground italic text-center">
              {displayText("\"Higher performance can improve your booking priority.\"")}
            </p>
          </div>
        </Card>
      )}

      <div className="space-y-2">
        <div role="tablist" className="flex gap-1 p-1 rounded-full bg-muted overflow-x-auto no-scrollbar snap-x">
          {LEADERBOARD_TABS.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => switchTab(t)}
              className={`flex-1 shrink-0 snap-start whitespace-nowrap px-3 py-2 rounded-full text-xs font-bold transition-all duration-300 ${tab === t ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground"}`}
            >
              {tabLabels[t]}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between px-1">
          <p className="text-[10px] text-muted-foreground">{tabHelp[tab]}</p>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="w-3.5 h-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="text-[10px] max-w-[200px]">{tabHelp[tab]}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div
          key={tab}
          onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => onTouchEnd(e.changedTouches[0].clientX)}
          className={`space-y-2 animate-in fade-in duration-300 ${slideDir === "left" ? "slide-in-from-right-8" : "slide-in-from-left-8"}`}
        >
          {top3.map((w, i) => (
            <WorkerRow key={w.id} worker={w} tab={tab} medal={i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"} />
          ))}
          {others.map((w) => (
            <WorkerRow key={w.id} worker={w} tab={tab} />
          ))}
        </div>
      </div>
    </div>
  );
}

function WorkerRow({ worker, medal, tab }: { worker: RankedWorker<LeaderboardEntry>; medal?: string; tab: LeaderboardTab }) {
  useWorkerLanguage();
  return (
    <div className={`flex items-center justify-between p-2.5 rounded-xl border ${worker.isMe ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800' : 'bg-card border-border'} shadow-sm`}>
      <div className="flex items-center gap-3">
        <span className="text-base w-6 text-center font-bold">
          {medal || `#${worker.displayRank}`}
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
            <p className={`text-xs font-bold ${worker.isMe ? 'text-emerald-700 dark:text-emerald-400' : ''}`}>
              {worker.full_name}
            </p>
            {worker.isMe && (
              <span className="px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 text-[9px] font-extrabold uppercase">
                {displayText("YOU")}
              </span>
            )}
            <LevelBadge level={worker.level} size="xs" />
          </div>
          <div className="flex items-center gap-2 mt-0.5 opacity-80">
            <div className="flex items-center gap-0.5">
              <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
              <span className="text-[10px] font-bold">{(tab === "rated" && worker.reviewAverage !== null ? worker.reviewAverage : worker.rating).toFixed(1)}</span>
            </div>
            {tab === "top" && (
              <div className="flex items-center gap-0.5">
                <Zap className="w-2.5 h-2.5 fill-primary text-primary" />
                <span className="text-[10px] font-bold">Prio {worker.priority_score}</span>
              </div>
            )}
            {tab === "earners" && (
              <span className="text-[10px] font-bold">{worker.jobsToday} {displayText("Jobs")}</span>
            )}
          </div>
        </div>
      </div>
      <div className="text-right">
        {tab === "rated" ? (
          <>
            <p className="text-sm font-extrabold flex items-center justify-end gap-0.5">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              {worker.reviewAverage !== null ? worker.reviewAverage.toFixed(1) : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {worker.reviewCount > 0 ? `${worker.reviewCount} ${displayText("reviews")}` : displayText("No reviews yet")}
            </p>
          </>
        ) : tab === "earners" ? (
          <p className="text-sm font-extrabold text-green-600 flex items-center justify-end">
            <IndianRupee className="w-3 h-3" />
            {worker.earningsToday}
          </p>
        ) : (
          <>
            <p className="text-[10px] font-bold text-foreground leading-none">{worker.jobsToday} {displayText("Jobs")}</p>
            <p className="text-[11px] font-extrabold text-green-600 flex items-center justify-end mt-0.5">
              <IndianRupee className="w-2.5 h-2.5" />
              {worker.earningsToday}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function LevelBadge({ level, size = "sm" }: { level: string; size?: "sm" | "xs" }) {
  useWorkerLanguage();
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
  useWorkerLanguage();
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
