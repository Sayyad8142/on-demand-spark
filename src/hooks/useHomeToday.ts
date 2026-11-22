import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { istStartOfDay } from "@/lib/payoutDisplay";
import { confirmedUpcoming, countCompletedToday, type UpcomingRow } from "@/lib/homeSummary";
import { WORKER_BOOKING_COLUMNS } from "@/lib/workerBookingColumns";

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
  const currentWorker = useRef(workerId);
  currentWorker.current = workerId;
  const [owner, setOwner] = useState<string | null | undefined>();

  const load = useCallback(async () => {
    if (!workerId) { setCompleted(null); setUpcoming(null); setLoading(false); return; }
    const since = istStartOfDay(new Date()).toISOString();
    const [done, next] = await Promise.all([
      supabase.from("bookings").select("status, completed_at").eq("worker_id", workerId).eq("status", "completed").gte("completed_at", since).limit(200),
      supabase.rpc("get_worker_upcoming_scheduled_bookings", { p_limit: 20 }),
    ]);
    if (currentWorker.current !== workerId) return;
    setCompleted(done.error ? null : countCompletedToday((done.data ?? []) as any));
    if (next.error) setUpcoming(null);
    else {
      const rows = (next.data ?? []) as UpcomingRow[];
      // The community-wide RPC also returns unassigned bookings. Prove ownership
      // through an own-worker read before showing a job as assigned on Home.
      const ids = rows.map(r => r.booking_id);
      if (!ids.length) setUpcoming([]);
      else {
        const own = await supabase.from("bookings").select(WORKER_BOOKING_COLUMNS)
          .eq("worker_id", workerId).in("id", ids);
        if (currentWorker.current !== workerId) return;
        setUpcoming(own.error ? null : confirmedUpcoming(rows, new Set((own.data ?? []).map(b => b.id))));
      }
    }
    setOwner(workerId);
    setLoading(false);
  }, [workerId]);

  useEffect(() => {
    void load();
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    const iv = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 60_000);
    return () => { document.removeEventListener("visibilitychange", onVisible); window.clearInterval(iv); };
  }, [load]);

  return owner === workerId && workerId ? { completedToday, upcoming, loading } : { completedToday: null, upcoming: null, loading: Boolean(workerId) };
}
