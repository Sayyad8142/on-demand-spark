import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { supabase } from "@/integrations/supabase/client";
import { leaderboardScore } from "@/lib/leaderboardRanking";

/** Shared exact server score; event payloads never supply score values. */
export function useWorkerPriority(workerId: string | null | undefined) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["worker-priority", workerId],
    enabled: !!workerId,
    queryFn: async () => {
      if (!workerId) throw new Error("No worker");
      const { data, error } = await supabase.from("workers").select("priority_score,score_reason").eq("id", workerId).maybeSingle();
      if (error) throw error;
      return { score: leaderboardScore(data?.priority_score), reason: data?.score_reason ?? null };
    },
    staleTime: 0, refetchOnMount: "always", refetchInterval: 15_000, refetchIntervalInBackground: false,
  });
  useEffect(() => {
    if (!workerId) return;
    const refresh = () => {
      void client.invalidateQueries({ queryKey: ["worker-priority", workerId] });
      void client.invalidateQueries({ queryKey: ["late-start-priority"] });
    };
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", refresh);
    window.addEventListener("bookingCompleted", refresh);
    let disposed = false;
    let native: { remove: () => Promise<void> } | undefined;
    if (Capacitor.isNativePlatform()) void App.addListener("appStateChange", ({ isActive }) => { if (isActive) refresh(); })
      .then(h => { if (disposed) void h.remove(); else native = h; }).catch(() => undefined);
    const channel = supabase.channel(`priority-${workerId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "workers", filter: `id=eq.${workerId}` }, refresh).subscribe();
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("online", refresh);
      window.removeEventListener("bookingCompleted", refresh);
      void native?.remove();
      void supabase.removeChannel(channel);
    };
  }, [workerId, client]);
  return query;
}