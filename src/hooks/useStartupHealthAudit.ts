/**
 * useStartupHealthAudit — one-shot audit on cold launch.
 *
 * Runs a full silent health pass shortly after login:
 *   - forces a push health check with autoRepair on
 *   - triggers the automatic push repair coordinator explicitly
 *   - leaves any user-facing interruption to the health badge / go-online gate
 *
 * Only runs once per app session (guarded by module-level flag).
 */

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { triggerAutomaticPushRepair } from "@/services/pushRepairCoordinator";

let ranThisSession = false;

export function useStartupHealthAudit(userId: string | undefined | null) {
  useEffect(() => {
    if (!userId) return;
    if (ranThisSession) return;
    if (!Capacitor.isNativePlatform()) {
      ranThisSession = true;
      return;
    }

    ranThisSession = true;
    // Slight delay so auth / native bridges have settled.
    const t = setTimeout(() => {
      console.log("🏁 [StartupAudit] Running cold-launch health audit");
      void triggerAutomaticPushRepair(userId, "startup-audit");
    }, 2500);

    return () => clearTimeout(t);
  }, [userId]);
}
