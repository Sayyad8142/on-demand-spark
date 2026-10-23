import { useCallback, useEffect, useState } from "react";
import { App as CapApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { CURRENT_VERSION_CODE } from "@/config/version";
import { decideUpdate, makeSnooze, parseUpdateAnswer, type SoftSnooze, type UpdateAnswer } from "@/lib/updateDecision";

const SNOOZE_KEY = "worker_soft_update_snooze_v3";

function readSnooze(): SoftSnooze | null {
  try { const v = JSON.parse(localStorage.getItem(SNOOZE_KEY) || "null"); return v && typeof v.build === "number" ? v : null; } catch { return null; }
}

async function installedBuild(): Promise<number> {
  if (Capacitor.isNativePlatform()) {
    try { const n = Number((await CapApp.getInfo()).build); if (Number.isInteger(n) && n > 0) return n; } catch {}
  }
  return CURRENT_VERSION_CODE;
}

/**
 * Asks the Admin Panel RPC on start and on every resume (no throttle, so returning
 * from Google Play rechecks immediately). Display only: never changes availability.
 */
export function useUpdateDecision(activeBookingStatus: string | null | undefined, bookingAlertOpen = false) {
  const [answer, setAnswer] = useState<UpdateAnswer | null>(null);
  const [build, setBuild] = useState<number>(CURRENT_VERSION_CODE);
  const [snooze, setSnooze] = useState<SoftSnooze | null>(readSnooze);

  const refresh = useCallback(async () => {
    const b = await installedBuild();
    setBuild(b);
    try {
      const { data, error } = await supabase.rpc("get_app_update_decision" as never, { _app: "worker", _platform: "android", _build: b } as never);
      if (!error) setAnswer(parseUpdateAnswer(data));
    } catch { /* offline: keep last known answer; never block */ }
  }, []);

  useEffect(() => {
    void refresh();
    const onVis = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVis);
    let remove: (() => void) | undefined;
    if (Capacitor.isNativePlatform()) {
      CapApp.addListener("resume", () => void refresh()).then((h) => { remove = () => h.remove(); }).catch(() => {});
    }
    return () => { document.removeEventListener("visibilitychange", onVis); remove?.(); };
  }, [refresh]);

  const mode = decideUpdate({ answer, activeBookingStatus, bookingAlertOpen, snooze, now: Date.now() });

  const later = useCallback(() => {
    const s = makeSnooze(answer?.latestBuild ?? build + 1, Date.now());
    try { localStorage.setItem(SNOOZE_KEY, JSON.stringify(s)); } catch {}
    setSnooze(s);
  }, [answer?.latestBuild, build]);

  return { mode, answer, installedBuild: build, later };
}
