import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

/**
 * NO-GPS heartbeat: updates workers.last_seen_at every 2 minutes
 * so the admin panel shows the worker as online.
 * Does NOT use any location permissions.
 */
export function useHeartbeat(workerId: string | undefined | null) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!workerId) return;

    const beat = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          console.log("💓 Heartbeat skipped — no session");
          return;
        }

        const { error } = await supabase
          .from("workers")
          .update({ last_seen_at: new Date().toISOString() })
          .eq("id", workerId);

        if (error) {
          console.warn("💓 Heartbeat update failed:", error.message);
        } else {
          console.log("💓 Heartbeat sent");
        }
      } catch (err) {
        console.warn("💓 Heartbeat error:", err);
      }
    };

    // Immediate first beat
    beat();

    // Repeat every 2 minutes
    intervalRef.current = setInterval(beat, HEARTBEAT_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [workerId]);
}
