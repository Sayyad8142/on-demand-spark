import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Bell, BellOff, TrendingUp, AlertTriangle, Clock, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Props {
  workerId?: string | null;
  communities?: string[] | null;
  isOnline?: boolean;
  onGoOnline?: () => Promise<void> | void;
}

const HOURS = Array.from({ length: 13 }, (_, i) => 7 + i); // 7..19

type Tier = "best" | "good" | "hot" | "low";

interface HourStat {
  hour: number;
  total: number;
  completed: number;
  cancelled: number;
  failed: number;
  workersOnline: number;
  tier: Tier;
  message: string;
}

function hourLabel(h: number) {
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12} ${period}`;
}

function rangeLabel(h: number) {
  const end = (h + 1) % 24;
  return `${hourLabel(h)} – ${hourLabel(end)}`;
}

const REMINDER_KEY = "best_time_reminders_v1";

function getReminders(): number[] {
  try {
    return JSON.parse(localStorage.getItem(REMINDER_KEY) || "[]");
  } catch {
    return [];
  }
}
function setReminders(hours: number[]) {
  localStorage.setItem(REMINDER_KEY, JSON.stringify(hours));
}

export default function BestTimeToEarnCard({ workerId, communities, isOnline, onGoOnline }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<HourStat[]>([]);
  const [reminders, setRemindersState] = useState<number[]>(getReminders());
  const [working, setWorking] = useState(false);

  const myCommunities = useMemo(
    () => (communities || []).filter((c): c is string => !!c),
    [communities]
  );

  useEffect(() => {
    if (!myCommunities.length) {
      setStats([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

      // 1) Bookings in worker's communities
      const { data: bookings } = await supabase
        .from("bookings")
        .select("scheduled_time, created_at, status, worker_id, community")
        .in("community", myCommunities)
        .gte("created_at", since)
        .limit(10000);

      // 2) Workers serving these communities (overlap)
      const { data: communityWorkers } = await supabase
        .from("workers")
        .select("id, communities, community")
        .or(
          `communities.ov.{${myCommunities.map((c) => `"${c}"`).join(",")}},community.in.(${myCommunities
            .map((c) => `"${c}"`)
            .join(",")})`
        )
        .limit(2000);

      const workerIds = (communityWorkers || []).map((w: any) => w.id);

      // 3) Worker availability for today's day-of-week (Mon=0..Sun=6)
      const jsDow = new Date().getDay();
      const dow = jsDow === 0 ? 6 : jsDow - 1;
      let availability: any[] = [];
      if (workerIds.length) {
        const { data: av } = await supabase
          .from("worker_availability")
          .select("worker_id, slots")
          .eq("day_of_week", dow)
          .in("worker_id", workerIds);
        availability = av || [];
      }

      if (cancelled) return;

      // Aggregate per hour
      const byHour: Record<number, HourStat> = {};
      for (const h of HOURS) {
        byHour[h] = {
          hour: h,
          total: 0,
          completed: 0,
          cancelled: 0,
          failed: 0,
          workersOnline: 0,
          tier: "low",
          message: "",
        };
      }

      for (const b of (bookings || []) as any[]) {
        let h: number | null = null;
        if (b.scheduled_time) {
          const parsed = parseInt(String(b.scheduled_time).split(":")[0], 10);
          if (Number.isFinite(parsed)) h = parsed;
        }
        if (h == null && b.created_at) {
          h = new Date(b.created_at).getHours();
        }
        if (h == null || !byHour[h]) continue;
        byHour[h].total += 1;
        if (b.status === "completed") byHour[h].completed += 1;
        else if (b.status === "cancelled") {
          byHour[h].cancelled += 1;
          if (!b.worker_id) byHour[h].failed += 1;
        }
      }

      // Workers online per hour
      for (const row of availability) {
        const slots = (row.slots as boolean[] | null) || null;
        if (!slots) continue;
        for (const h of HOURS) {
          const i1 = (h - 7) * 2;
          const i2 = i1 + 1;
          if (slots[i1] || slots[i2]) byHour[h].workersOnline += 1;
        }
      }

      // Classify tier + message
      const totals = HOURS.map((h) => byHour[h].total);
      const maxTotal = Math.max(1, ...totals);

      for (const h of HOURS) {
        const s = byHour[h];
        const demand = s.total / maxTotal; // 0..1
        const supply = s.workersOnline;
        const gap = demand - Math.min(1, supply / 8); // rough demand-vs-supply

        if (s.total >= maxTotal * 0.4 && (s.failed >= 2 || supply <= 1)) {
          s.tier = "hot";
          s.message = "High bookings, low workers";
        } else if (demand >= 0.6 && gap > 0) {
          s.tier = "best";
          s.message = "Best time to earn";
        } else if (demand >= 0.35) {
          s.tier = "good";
          s.message = "Good time to be online";
        } else {
          s.tier = "low";
          s.message = "Low bookings";
        }
      }

      setStats(HOURS.map((h) => byHour[h]));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [myCommunities.join("|")]);

  // Top 3 recommended slots
  const recommended = useMemo(() => {
    const scored = stats.map((s) => {
      let score = s.total + s.failed * 3;
      if (s.tier === "hot") score += 20;
      if (s.tier === "best") score += 10;
      if (s.workersOnline <= 1) score += 5;
      return { ...s, score };
    });
    return scored.sort((a, b) => b.score - a.score).slice(0, 3).filter((s) => s.total > 0 || s.failed > 0);
  }, [stats]);

  // Reminder timer — fires 15 min before any saved reminder hour, today only
  useEffect(() => {
    if (!reminders.length) return;
    const timers: number[] = [];
    const now = new Date();
    for (const h of reminders) {
      const target = new Date();
      target.setHours(h, 0, 0, 0);
      const fireAt = target.getTime() - 15 * 60 * 1000;
      const delay = fireAt - now.getTime();
      if (delay > 0 && delay < 24 * 60 * 60 * 1000) {
        const id = window.setTimeout(() => {
          toast({
            title: "⏰ High demand starting soon",
            description: `${rangeLabel(h)} — go online to catch bookings.`,
          });
        }, delay);
        timers.push(id);
      }
    }
    return () => {
      timers.forEach((t) => clearTimeout(t));
    };
  }, [reminders, toast]);

  const toggleReminder = (h: number) => {
    const next = reminders.includes(h) ? reminders.filter((x) => x !== h) : [...reminders, h];
    setReminders(next);
    setRemindersState(next);
    toast({
      title: next.includes(h) ? "Reminder set" : "Reminder removed",
      description: next.includes(h)
        ? `We'll alert you 15 min before ${rangeLabel(h)}`
        : `No reminder for ${rangeLabel(h)}`,
    });
  };

  const handleGoOnline = async (h: number) => {
    if (!onGoOnline) {
      toast({
        title: "Open Availability",
        description: `Turn on ${rangeLabel(h)} in your availability to get bookings.`,
      });
      return;
    }
    try {
      setWorking(true);
      await onGoOnline();
      toast({
        title: "✅ You are online",
        description: `Ready for bookings in ${rangeLabel(h)}`,
      });
    } catch (e: any) {
      toast({
        title: "Couldn't go online",
        description: e?.message || "Please try from the Home screen.",
        variant: "destructive",
      });
    } finally {
      setWorking(false);
    }
  };

  const tierStyles: Record<Tier, { bg: string; dot: string; text: string; icon: JSX.Element }> = {
    best: {
      bg: "bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-900",
      dot: "bg-green-500",
      text: "text-green-700 dark:text-green-300",
      icon: <Sparkles className="w-4 h-4" />,
    },
    good: {
      bg: "bg-yellow-50 dark:bg-yellow-950/40 border-yellow-200 dark:border-yellow-900",
      dot: "bg-yellow-500",
      text: "text-yellow-800 dark:text-yellow-300",
      icon: <TrendingUp className="w-4 h-4" />,
    },
    hot: {
      bg: "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900",
      dot: "bg-red-500",
      text: "text-red-700 dark:text-red-300",
      icon: <AlertTriangle className="w-4 h-4" />,
    },
    low: {
      bg: "bg-muted/40 border-border",
      dot: "bg-muted-foreground/40",
      text: "text-muted-foreground",
      icon: <Clock className="w-4 h-4" />,
    },
  };

  if (!myCommunities.length) return null;

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="w-5 h-5 text-primary" />
          Best Time to Get Bookings
        </CardTitle>
        <CardDescription className="text-xs">
          Based on your society · Last 60 days
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-4 space-y-4">
        {/* Legend */}
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500" />Best</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500" />Good</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500" />High demand, low workers</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/40" />Low</span>
        </div>

        {/* Hourly chart — colored bars 7AM-7PM */}
        <div>
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: `repeat(${HOURS.length}, minmax(0, 1fr))` }}
          >
            {stats.map((s) => {
              const maxTotal = Math.max(1, ...stats.map((x) => x.total));
              const heightPct = Math.max(8, Math.round((s.total / maxTotal) * 100));
              const color =
                s.tier === "best"
                  ? "bg-green-500"
                  : s.tier === "good"
                  ? "bg-yellow-500"
                  : s.tier === "hot"
                  ? "bg-red-500"
                  : "bg-muted-foreground/30";
              return (
                <div key={s.hour} className="flex flex-col items-center gap-1">
                  <div className="h-20 w-full flex items-end">
                    <div className={`w-full rounded-t-md ${color}`} style={{ height: `${heightPct}%` }} />
                  </div>
                  <span className="text-[9px] text-muted-foreground leading-none">{hourLabel(s.hour).replace(" ", "")}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top 3 recommended slots */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-foreground">Top slots for you today</p>
          {loading && (
            <p className="text-xs text-muted-foreground">Finding your best slots…</p>
          )}
          {!loading && recommended.length === 0 && (
            <p className="text-xs text-muted-foreground">Not enough data yet. Check back soon.</p>
          )}
          {recommended.map((s, idx) => {
            const styles = tierStyles[s.tier];
            const reminderOn = reminders.includes(s.hour);
            return (
              <div key={s.hour} className={`rounded-xl border p-3 ${styles.bg}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                        #{idx + 1}
                      </Badge>
                      <span className="text-sm font-bold">{rangeLabel(s.hour)}</span>
                      <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${styles.text}`}>
                        {styles.icon}
                        {s.message}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {s.total} bookings
                      {s.failed > 0 ? ` · ${s.failed} missed` : ""}
                      {` · ${s.workersOnline} workers free`}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 mt-2">
                  <Button
                    size="sm"
                    className="flex-1 h-8 text-xs"
                    onClick={() => handleGoOnline(s.hour)}
                    disabled={working || isOnline}
                  >
                    <Zap className="w-3.5 h-3.5 mr-1" />
                    {isOnline ? "You're online" : "Go Online for This Slot"}
                  </Button>
                  <Button
                    size="sm"
                    variant={reminderOn ? "secondary" : "outline"}
                    className="h-8 text-xs"
                    onClick={() => toggleReminder(s.hour)}
                  >
                    {reminderOn ? <BellOff className="w-3.5 h-3.5 mr-1" /> : <Bell className="w-3.5 h-3.5 mr-1" />}
                    {reminderOn ? "Reminder on" : "Remind me"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-[10px] text-muted-foreground text-center pt-1">
          Showing only your society's bookings
        </p>
      </CardContent>
    </Card>
  );
}
