/**
 * Worker heartbeat — calls the worker-heartbeat edge function.
 *
 * Triggered:
 *  - on app open (cold start with session)
 *  - on login
 *  - on foreground resume
 *  - every 2 minutes while app is open
 *
 * Sends full device context so admin can compute notification_health.
 */

import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { CURRENT_VERSION_NAME } from "@/config/version";

// @ts-ignore - native bridge
const AuthBridge = (window as any).Capacitor?.Plugins?.AuthBridge;

export type HeartbeatReason = "open" | "login" | "foreground" | "interval";

let inFlight = false;

async function getNativeFcmToken(): Promise<string | null> {
  if (!Capacitor.isNativePlatform() || !AuthBridge) return null;
  try {
    const res = await AuthBridge.getPendingFCMToken?.();
    return res?.token ?? null;
  } catch {
    return null;
  }
}

async function getDeviceInfo() {
  const info: Record<string, unknown> = {
    platform: Capacitor.getPlatform(),
  };

  // Notification permission
  try {
    if (Capacitor.isNativePlatform()) {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      const p = await PushNotifications.checkPermissions();
      info.notification_permission = p.receive === "granted" ? "granted"
        : p.receive === "denied" ? "denied"
        : "default";
    } else if (typeof Notification !== "undefined") {
      info.notification_permission = Notification.permission;
    } else {
      info.notification_permission = "unknown";
    }
  } catch {
    info.notification_permission = "unknown";
  }

  // Manufacturer / model / overlay / battery (native bridge if available)
  if (Capacitor.isNativePlatform() && AuthBridge?.getDeviceContext) {
    try {
      const ctx = await AuthBridge.getDeviceContext();
      if (ctx) {
        if (ctx.manufacturer) info.manufacturer = ctx.manufacturer;
        if (ctx.model) info.model = ctx.model;
        if (typeof ctx.sdk === "number") info.sdk = ctx.sdk;
        if (typeof ctx.battery_optimized === "boolean") info.battery_optimized = ctx.battery_optimized;
        if (typeof ctx.overlay_granted === "boolean") info.overlay_granted = ctx.overlay_granted;
      }
    } catch {/* optional */}
  }

  return info;
}

export async function sendWorkerHeartbeat(
  workerIdOrUserId: string | undefined | null,
  reason: HeartbeatReason,
): Promise<void> {
  if (!workerIdOrUserId) return;
  if (inFlight) return;
  inFlight = true;

  try {
    const [fcmToken, deviceInfo] = await Promise.all([
      getNativeFcmToken(),
      getDeviceInfo(),
    ]);

    const { data, error } = await supabase.functions.invoke("worker-heartbeat", {
      body: {
        worker_id: workerIdOrUserId,
        fcm_token: fcmToken ?? undefined,
        app_state: reason,
        app_version: CURRENT_VERSION_NAME,
        device_info: deviceInfo,
      },
    });

    if (error) {
      console.warn(`💓 [heartbeat:${reason}] failed`, error.message);
      return;
    }
    console.log(`💓 [heartbeat:${reason}] ok`, data);

    // If the edge function picked up a native token and persisted it, clear pending.
    if (fcmToken && (data as any)?.token_changed && AuthBridge?.clearPendingFCMToken) {
      try { await AuthBridge.clearPendingFCMToken(); } catch {/* ignore */}
    }
  } catch (e) {
    console.warn(`💓 [heartbeat:${reason}] threw`, e);
  } finally {
    inFlight = false;
  }
}
