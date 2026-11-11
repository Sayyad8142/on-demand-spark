import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { istStartOfDay } from "@/lib/payoutDisplay";
import { confirmedUpcoming, countCompletedToday, type UpcomingRow } from "@/lib/homeSummary";

export interface HomeTodayData {
  completedToday: number | null;
  upcoming: UpcomingRow[] | null;
  loading: boolean;
}

/** Read-only: today's completed jobs (worker's own bookings) + confirmed upcoming jobs (existing RPC). */
export function useHomeToday(workerId: string | null | undefined): HomeTodayData {
  const [completedToday, setCompleted] = useState<number | null>(null);
  const [upcoming, setUpcoming] = useState<UpcomingRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!workerId) { setLoading(false); return; }
    const since = istStartOfDay(new Date()).toISOString();
    const [done, next] = await Promise.all([
      supabase.from("bookings").select("status, completed_at").eq("worker_id", workerId).eq("status", "completed").gte("completed_at", since).limit(200),
      supabase.rpc("get_worker_upcoming_scheduled_bookings", { p_limit: 20 }),
    ]);
    if (!done.error) setCompleted(countCompletedToday((done.data ?? []) as any));
    if (!next.error) setUpcoming(confirmedUpcoming((next.data ?? []) as UpcomingRow[]));
    setLoading(false);
  }, [workerId]);

  useEffect(() => {
    void load();
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    const iv = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 60_000);
    return () => { document.removeEventListener("visibilitychange", onVisible); window.clearInterval(iv); };
  }, [load]);

  return { completedToday, upcoming, loading };
}
