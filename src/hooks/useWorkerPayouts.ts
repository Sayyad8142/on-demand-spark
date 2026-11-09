import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { PayoutRecord } from "@/lib/payoutDisplay";
import { fetchAllWorkerPayouts } from "@/lib/workerPayoutsApi";

export interface UseWorkerPayouts {
  payouts: PayoutRecord[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => Promise<void>;
}

/**
 * Read-only payout records for a worker with realtime updates and refresh on
 * foreground / reconnect. Keeps the last good data visible when a refresh fails.
 */
export function useWorkerPayouts(workerId: string | null | undefined, onChange?: (row: Partial<PayoutRecord>) => void): UseWorkerPayouts {
  const [payouts, setPayouts] = useState<PayoutRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const reqId = useRef(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const refresh = useCallback(async () => {
    if (!workerId) { setLoading(false); return; }
    const id = ++reqId.current;
    try {
      const rows = await fetchAllWorkerPayouts(workerId);
      if (id !== reqId.current) return;
      setPayouts(rows);
      setError(null);
      setLastUpdated(new Date());
    } catch (e) {
      if (id !== reqId.current) return;
      console.warn("[payouts] load failed", (e as { message?: string })?.message);
      setError("load_failed");
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [workerId]);

  useEffect(() => { setLoading(true); refresh(); }, [refresh]);

  // Foreground + reconnect refresh
  useEffect(() => {
    if (!workerId) return;
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    const onOnline = () => refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    let disposed = false;
    let sub: { remove: () => void } | null = null;
    import("@capacitor/app")
      .then(({ App }) => App.addListener("appStateChange", (s) => { if (s.isActive) refresh(); }))
      .then((h) => { if (disposed) h.remove(); else sub = h; })
      .catch(() => undefined);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      sub?.remove();
    };
  }, [workerId, refresh]);

  // Realtime
  useEffect(() => {
    if (!workerId) return;
    const channel = supabase
      .channel(`worker-payouts-${workerId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "worker_payouts", filter: `worker_id=eq.${workerId}` },
        (payload) => {
          onChangeRef.current?.(payload.new as Partial<PayoutRecord>);
          refresh();
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [workerId, refresh]);

  return { payouts, loading, error, lastUpdated, refresh };
}
