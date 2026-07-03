/**
 * useWorkerHealth — unified Worker Health Engine.
 *
 * Reuses existing signals (usePushHealthGuard, navigator.onLine, worker row)
 * and derives a single overall status:
 *   - "ready"    → green: worker can receive bookings
 *   - "warning"  → yellow: works but degraded (e.g. battery optimized, overlay off)
 *   - "blocked"  → red: cannot receive bookings (permission denied, no token, offline)
 *
 * Also returns the top 1–3 human-readable reasons for the current state.
 */

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import type { PushHealthState } from "./usePushHealthGuard";

// @ts-ignore
const AuthBridge = (window as any).Capacitor?.Plugins?.AuthBridge;

export type WorkerHealthStatus = "ready" | "warning" | "blocked";

export interface WorkerHealthReason {
  code: string;
  label: string;
  severity: "blocker" | "warn";
}

export interface WorkerHealthState {
  status: WorkerHealthStatus;
  score: number; // 0–100
  reasons: WorkerHealthReason[];
  online: boolean;
  loading: boolean;
}

interface DeviceExtras {
  batteryOptimized?: boolean;
  overlayGranted?: boolean;
}

const INITIAL: WorkerHealthState = {
  status: "warning",
  score: 60,
  reasons: [],
  online: true,
  loading: true,
};

export function useWorkerHealth(
  workerId: string | undefined | null,
  pushHealth: PushHealthState,
): WorkerHealthState {
  const [state, setState] = useState<WorkerHealthState>(INITIAL);
  const [deviceExtras, setDeviceExtras] = useState<DeviceExtras>({});
  const [online, setOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [workerFlags, setWorkerFlags] = useState<{
    notificationHealth?: string | null;
    fcmTokenStatus?: string | null;
    outdated?: boolean;
  }>({});

  // Network listeners
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // Native extras: battery / overlay
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!Capacitor.isNativePlatform() || !AuthBridge?.getDeviceContext) return;
      try {
        const info = await AuthBridge.getDeviceContext();
        if (cancelled || !info) return;
        setDeviceExtras({
          batteryOptimized: info.battery_optimized,
          overlayGranted: info.overlay_granted,
        });
      } catch {
        /* ignore */
      }
    };
    load();
    const t = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  // Worker row poll — refresh notification_health / fcm_token_status
  useEffect(() => {
    if (!workerId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const { data } = await supabase
          .from("workers")
          .select("notification_health, fcm_token_status")
          .eq("id", workerId)
          .maybeSingle();
        if (cancelled) return;
        setWorkerFlags((prev) => ({
          ...prev,
          notificationHealth: (data as any)?.notification_health ?? null,
          fcmTokenStatus: (data as any)?.fcm_token_status ?? null,
        }));
      } catch {
        /* ignore */
      }
    };
    load();
    const t = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [workerId]);

  // Derive
  useEffect(() => {
    const reasons: WorkerHealthReason[] = [];
    let score = 100;

    if (!online) {
      reasons.push({ code: "offline", label: "No internet connection", severity: "blocker" });
      score -= 60;
    }

    if (Capacitor.isNativePlatform() && !pushHealth.permissionGranted) {
      reasons.push({
        code: "notifications_denied",
        label: "Notifications are turned off — you won't hear booking alerts",
        severity: "blocker",
      });
      score -= 40;
    }

    if (Capacitor.isNativePlatform() && (!pushHealth.tokenExists || !pushHealth.tokenSyncedToBackend)) {
      reasons.push({
        code: "no_fcm_token",
        label: "Booking alerts not registered yet",
        severity: "blocker",
      });
      score -= 40;
    } else if (Capacitor.isNativePlatform() && !pushHealth.tokenHealthy) {
      reasons.push({
        code: "fcm_token_invalid",
        label: "Booking alerts need to be refreshed",
        severity: "blocker",
      });
      score -= 30;
    }

    if (workerFlags.notificationHealth === "poor") {
      reasons.push({
        code: "recent_missed_alerts",
        label: "Recent booking alerts did not reach you",
        severity: "warn",
      });
      score -= 15;
    }

    if (deviceExtras.batteryOptimized === true) {
      reasons.push({
        code: "battery_optimized",
        label: "Battery saver may delay booking alerts",
        severity: "warn",
      });
      score -= 10;
    }

    if (deviceExtras.overlayGranted === false) {
      reasons.push({
        code: "overlay_off",
        label: "Full-screen booking popup is disabled",
        severity: "warn",
      });
      score -= 10;
    }

    score = Math.max(0, Math.min(100, score));
    const hasBlocker = reasons.some((r) => r.severity === "blocker");
    const status: WorkerHealthStatus = hasBlocker
      ? "blocked"
      : reasons.length > 0
      ? "warning"
      : "ready";

    setState({
      status,
      score,
      reasons: reasons.slice(0, 3),
      online,
      loading: pushHealth.isChecking && reasons.length === 0,
    });
  }, [
    online,
    pushHealth.permissionGranted,
    pushHealth.tokenExists,
    pushHealth.tokenSyncedToBackend,
    pushHealth.tokenHealthy,
    pushHealth.isChecking,
    deviceExtras.batteryOptimized,
    deviceExtras.overlayGranted,
    workerFlags.notificationHealth,
  ]);

  return state;
}
