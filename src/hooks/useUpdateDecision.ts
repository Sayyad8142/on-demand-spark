import { useCallback, useEffect, useState } from "react";
import { App as CapApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { CURRENT_VERSION_CODE } from "@/config/version";
import { decideUpdate, makeSnooze, policyFromConfig, type SoftSnooze, type UpdatePolicy } from "@/lib/updateDecision";

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
 * Centralized update check. Re-reads the installed build and Admin Panel policy
 * on start and every time the app resumes. Display only: never changes availability.
 */
export function useUpdateDecision(activeBookingStatus: string | null | undefined) {
  const [policy, setPolicy] = useState<UpdatePolicy | null>(null);
  const [build, setBuild] = useState<number>(CURRENT_VERSION_CODE);
  const [snooze, setSnooze] = useState<SoftSnooze | null>(readSnooze);

  const refresh = useCallback(async () => {
    setBuild(await installedBuild());
    try {
      // select("*") so newly added contract columns (latest_worker_version_code) are read without breaking older schemas.
      const { data, error } = await supabase.from("app_config").select("*").maybeSingle();
      if (!error && data) setPolicy(policyFromConfig(data as Record<string, unknown>));
    } catch { /* keep last known policy; never block on network failure */ }
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

  const mode = decideUpdate({ installedBuild: build, policy, activeBookingStatus, snooze, now: Date.now() });

  const later = useCallback(() => {
    if (!policy?.latestBuild) return;
    const s = makeSnooze(policy.latestBuild, Date.now());
    try { localStorage.setItem(SNOOZE_KEY, JSON.stringify(s)); } catch {}
    setSnooze(s);
  }, [policy?.latestBuild]);

  return { mode, policy, installedBuild: build, later };
}
