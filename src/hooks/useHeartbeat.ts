import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Capacitor } from "@capacitor/core";

const HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

// @ts-ignore - Capacitor bridge
const AuthBridge = (window as any).Capacitor?.Plugins?.AuthBridge;

/**
 * NO-GPS heartbeat: updates workers.last_seen_at every 2 minutes
 * so the admin panel shows the worker as online.
 *
 * Self-healing: also checks if the worker's fcm_token is missing/invalid
 * on the backend. If so, triggers a re-sync from native pending token.
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

        const { data, error } = await supabase
          .from("workers")
          .update({ last_seen_at: new Date().toISOString() })
          .eq("id", workerId)
          .select("fcm_token, fcm_token_status")
          .single();

        if (error) {
          console.warn("💓 Heartbeat update failed:", error.message);
          return;
        }

        console.log("💓 Heartbeat sent");

        // Self-heal: if token is missing or invalid, try to re-sync from native
        if (data && (!data.fcm_token || data.fcm_token_status === 'invalid')) {
          console.warn("⚠️ [Heartbeat] Token missing/invalid on backend, attempting self-heal...");
          
          if (Capacitor.isNativePlatform() && AuthBridge) {
            try {
              const result = await AuthBridge.getPendingFCMToken();
              const pendingToken = result?.token;
              
              if (pendingToken) {
                console.log("🔄 [Heartbeat] Found pending native token, syncing...");
                await supabase
                  .from("workers")
                  .update({
                    fcm_token: pendingToken,
                    fcm_token_status: 'active',
                    fcm_token_updated_at: new Date().toISOString(),
                    fcm_token_platform: 'android',
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", workerId);
                
                await AuthBridge.clearPendingFCMToken();
                console.log("✅ [Heartbeat] Token self-healed from native pending token");
              } else {
                console.warn("⚠️ [Heartbeat] No pending native token available for self-heal");
              }
            } catch (e) {
              console.warn("⚠️ [Heartbeat] Self-heal failed:", e);
            }
          }
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
