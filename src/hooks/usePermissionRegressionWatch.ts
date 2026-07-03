/**
 * usePermissionRegressionWatch — detects when a worker revokes notification,
 * overlay, or battery optimization exemption AFTER already being set up.
 *
 * Runs immediately on visibilitychange (worker returning from Settings) plus
 * a periodic 60s beat while the app is foregrounded and the worker is online.
 *
 * Compares against a locally-stored "last known good" snapshot. If a
 * regression is detected, triggers auto-repair (for FCM/push) and reports
 * a diagnostic tagged `permission_regressed_<what>`. The unified Worker
 * Health Badge picks up the state via useWorkerHealth and routes the
 * worker to the single /device-readiness screen for fix actions.
 */

import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { triggerAutomaticPushRepair } from "@/services/pushRepairCoordinator";
import { reportMissedBooking } from "@/lib/missedBookingDiagnostics";

// @ts-ignore
const AuthBridge = (window as any).Capacitor?.Plugins?.AuthBridge;

const SNAPSHOT_KEY = "worker.perm.snapshot.v1";
const POLL_MS = 60_000;

interface Snapshot {
  notification: "granted" | "denied" | "prompt" | "unknown";
  overlay: boolean | null;
  batteryOptimized: boolean | null;
  at: number;
}

async function capture(): Promise<Snapshot> {
  let notification: Snapshot["notification"] = "unknown";
  try {
    if (Capacitor.isNativePlatform()) {
      const p = await PushNotifications.checkPermissions();
      notification = (p.receive as any) ?? "unknown";
    }
  } catch { /* ignore */ }

  let overlay: boolean | null = null;
  let batteryOptimized: boolean | null = null;
  if (Capacitor.isNativePlatform() && AuthBridge?.getDeviceContext) {
    try {
      const info = await AuthBridge.getDeviceContext();
      overlay = typeof info?.overlay_granted === "boolean" ? info.overlay_granted : null;
      batteryOptimized = typeof info?.battery_optimized === "boolean" ? info.battery_optimized : null;
    } catch { /* ignore */ }
  }

  return { notification, overlay, batteryOptimized, at: Date.now() };
}

function loadSnapshot(): Snapshot | null {
  try { const raw = localStorage.getItem(SNAPSHOT_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function saveSnapshot(s: Snapshot) {
  try { localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export function usePermissionRegressionWatch(
  userId: string | undefined | null,
  workerId: string | undefined | null,
  isOnline: boolean,
) {
  const checkingRef = useRef(false);

  useEffect(() => {
    if (!userId || !Capacitor.isNativePlatform()) return;

    const runCheck = async (source: string) => {
      if (checkingRef.current) return;
      checkingRef.current = true;
      try {
        const current = await capture();
        const previous = loadSnapshot();
        saveSnapshot(current);

        if (!previous) return; // first run — just baseline

        const regressions: string[] = [];
        if (previous.notification === "granted" && current.notification !== "granted") {
          regressions.push("notification");
        }
        if (previous.overlay === true && current.overlay === false) {
          regressions.push("overlay");
        }
        if (previous.batteryOptimized === false && current.batteryOptimized === true) {
          regressions.push("battery_optimized");
        }

        if (regressions.length === 0) return;

        console.warn("🚫 [PermRegress] detected:", regressions, "source:", source);

        // Auto-repair path (notifications only can be repaired without user action;
        // overlay + battery require user in Settings — handled by unified Health screen).
        if (regressions.includes("notification")) {
          void triggerAutomaticPushRepair(userId, `perm-regress:${source}`);
        }

        void reportMissedBooking({
          workerId: workerId ?? undefined,
          userId,
          reason: `permission_regressed_${regressions.join("_")}`,
          extra: { source, previous, current, is_online: isOnline },
        });
      } finally {
        checkingRef.current = false;
      }
    };

    // Baseline immediately.
    void runCheck("mount");

    const onVisibility = () => {
      if (document.visibilityState === "visible") void runCheck("resume");
    };
    document.addEventListener("visibilitychange", onVisibility);

    let interval: ReturnType<typeof setInterval> | null = null;
    if (isOnline) interval = setInterval(() => runCheck("interval"), POLL_MS);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (interval) clearInterval(interval);
    };
  }, [userId, workerId, isOnline]);
}
