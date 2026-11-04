import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { supabase } from "@/integrations/supabase/client";
import { RECONNECT_REMINDER_ENABLED, isVerifiedAppOpen, shouldRecordVerifiedOpen } from "@/lib/reconnectReminder";

/**
 * Records a verified app open (true foreground + visible screen) via the staged
 * `record_verified_app_open` RPC. Inert while RECONNECT_REMINDER_ENABLED is false.
 * Fire-and-forget: never blocks UI, never touches availability.
 */
export function useVerifiedAppOpen(userId: string | undefined) {
  const last = useRef<number | null>(null);

  useEffect(() => {
    if (!RECONNECT_REMINDER_ENABLED || !userId || !Capacitor.isNativePlatform()) return;

    const record = (source: string) => {
      const ok = isVerifiedAppOpen({ appActive: true, documentVisible: document.visibilityState === "visible", source });
      const now = Date.now();
      if (!ok || !shouldRecordVerifiedOpen(last.current, now)) return;
      last.current = now;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.rpc as any)("record_verified_app_open").then(() => {}, () => {});
    };

    record("cold_start");
    const sub = CapApp.addListener("appStateChange", ({ isActive }) => { if (isActive) record("app_state_active"); });
    return () => { sub.then((h) => h.remove()).catch(() => {}); };
  }, [userId]);
}
