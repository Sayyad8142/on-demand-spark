/**
 * Missed booking diagnostics uploader.
 *
 * Captures a snapshot of device/app state and posts it to the
 * `report-missed-booking` edge function. Used when the app detects a
 * booking that was dispatched to this worker but never surfaced.
 *
 * Best-effort: never throws, never blocks the caller.
 */

import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { CURRENT_VERSION_NAME } from "@/config/version";

// @ts-ignore - native bridge
const AuthBridge = (window as any).Capacitor?.Plugins?.AuthBridge;

export interface MissedBookingContext {
  workerId?: string;
  userId?: string;
  bookingId?: string;
  bookingRequestId?: string;
  reason: string;
  isOnlineToggle?: boolean;
  lastHeartbeatAt?: string | null;
  lastNotificationAt?: string | null;
  extra?: Record<string, unknown>;
}

// Simple in-memory dedupe: {bookingId → timestamp}. Server also dedupes.
const recentlyReported = new Map<string, number>();
const DEDUPE_MS = 10 * 60 * 1000;

async function captureDeviceContext() {
  const ctx: Record<string, unknown> = {
    platform: Capacitor.getPlatform(),
    network_online: typeof navigator !== "undefined" ? navigator.onLine : null,
    app_version: CURRENT_VERSION_NAME,
    app_state: typeof document !== "undefined" ? document.visibilityState : "unknown",
  };

  // Notification permission
  try {
    if (Capacitor.isNativePlatform()) {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      const p = await PushNotifications.checkPermissions();
      ctx.notification_permission = p.receive;
    } else if (typeof Notification !== "undefined") {
      ctx.notification_permission = Notification.permission;
    }
  } catch {
    ctx.notification_permission = "unknown";
  }

  // Native device context (battery/overlay/manufacturer)
  if (Capacitor.isNativePlatform() && AuthBridge?.getDeviceContext) {
    try {
      const info = await AuthBridge.getDeviceContext();
      if (info) {
        if (info.manufacturer) ctx.manufacturer = info.manufacturer;
        if (info.model) ctx.model = info.model;
        if (typeof info.sdk === "number") ctx.sdk = info.sdk;
        if (typeof info.battery_optimized === "boolean") ctx.battery_optimized = info.battery_optimized;
        if (typeof info.overlay_granted === "boolean") ctx.overlay_granted = info.overlay_granted;
      }
    } catch { /* optional */ }
  }

  return ctx;
}

export async function reportMissedBooking(input: MissedBookingContext): Promise<void> {
  try {
    if (!input.reason) return;
    if (!input.workerId && !input.userId) return;

    // Local dedupe by bookingId (or request id, or reason-only fallback).
    const dedupeKey = input.bookingId || input.bookingRequestId || `${input.workerId || input.userId}:${input.reason}`;
    const now = Date.now();
    const last = recentlyReported.get(dedupeKey) || 0;
    if (now - last < DEDUPE_MS) {
      return;
    }
    recentlyReported.set(dedupeKey, now);

    const ctx = await captureDeviceContext();

    // FCM token status from workers row (best-effort)
    let fcmTokenStatus: string | null = null;
    let fcmTokenPresent: boolean | null = null;
    if (input.workerId || input.userId) {
      try {
        const q = supabase.from("workers").select("fcm_token, fcm_token_status");
        const { data } = input.workerId
          ? await q.eq("id", input.workerId).maybeSingle()
          : await q.eq("user_id", input.userId!).maybeSingle();
        fcmTokenStatus = data?.fcm_token_status ?? null;
        fcmTokenPresent = !!data?.fcm_token;
      } catch { /* ignore */ }
    }

    const payload = {
      worker_id: input.workerId,
      user_id: input.userId,
      booking_id: input.bookingId,
      booking_request_id: input.bookingRequestId,
      reason: input.reason,
      is_online_toggle: input.isOnlineToggle,
      last_heartbeat_at: input.lastHeartbeatAt,
      last_notification_at: input.lastNotificationAt,
      fcm_token_status: fcmTokenStatus,
      fcm_token_present: fcmTokenPresent,
      ...ctx,
      extra: input.extra ?? {},
    };

    console.warn("📉 [MissedBooking] uploading diagnostic:", input.reason, input.bookingId);

    const { error } = await supabase.functions.invoke("report-missed-booking", { body: payload });
    if (error) {
      console.warn("📉 [MissedBooking] upload failed:", error.message);
    }
  } catch (e) {
    console.warn("📉 [MissedBooking] threw:", e);
  }
}
