import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Capacitor } from "@capacitor/core";
import { CURRENT_VERSION_CODE } from "@/config/version";
import { processIncomingBooking } from "@/services/bookingAlertCoordinator";
import { logScheduledOfferDecision } from "@/lib/scheduledBookingGuards";

const HEARTBEAT_INTERVAL_MS = 45 * 1000; // 45 seconds

// @ts-ignore - Capacitor bridge
const AuthBridge = (window as any).Capacitor?.Plugins?.AuthBridge;

/**
 * Enhanced heartbeat: sends device info every 45s while worker is online.
 * Also checks heartbeat response for pending bookings (polling fallback).
 * Replaces the old useHeartbeat hook.
 */
export function useEnhancedHeartbeat(
  workerId: string | undefined | null,
  isOnline: boolean
) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const beat = useCallback(async () => {
    if (!workerId || !mountedRef.current) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Gather device info
      let notificationPermission = "unknown";
      try {
        if (typeof Notification !== "undefined") {
          notificationPermission = Notification.permission;
        }
      } catch {}

      const now = new Date().toISOString();

      // Update worker heartbeat
      const { data, error } = await supabase
        .from("workers")
        .update({
          last_seen_at: now,
          last_active_at: now,
        })
        .eq("id", workerId)
        .select("fcm_token, fcm_token_status")
        .single();

      if (error) {
        console.warn("💓 Heartbeat failed:", error.message);
        return;
      }

      console.log("💓 Heartbeat sent");

      // Self-heal FCM token if missing/invalid
      if (data && (!data.fcm_token || data.fcm_token_status === "invalid")) {
        if (Capacitor.isNativePlatform() && AuthBridge) {
          try {
            const result = await AuthBridge.getPendingFCMToken();
            if (result?.token) {
              await supabase
                .from("workers")
                .update({
                  fcm_token: result.token,
                  fcm_token_status: "active",
                  fcm_token_updated_at: now,
                  fcm_token_platform: "android",
                  updated_at: now,
                })
                .eq("id", workerId);
              await AuthBridge.clearPendingFCMToken();
              console.log("✅ [Heartbeat] Token self-healed");
            }
          } catch (e) {
            console.warn("⚠️ [Heartbeat] Token self-heal failed:", e);
          }
        }
      }

      // POLLING FALLBACK: check for pending booking requests this worker hasn't seen
      await checkPendingBookingRequests(workerId);
    } catch (err) {
      console.warn("💓 Heartbeat error:", err);
    }
  }, [workerId]);

  // Start/stop based on online status
  useEffect(() => {
    mountedRef.current = true;

    if (!workerId || !isOnline) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Immediate beat when going online
    beat();

    intervalRef.current = setInterval(beat, HEARTBEAT_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [workerId, isOnline, beat]);

  // Beat on app resume while online
  useEffect(() => {
    if (!workerId || !isOnline) return;

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        console.log("💓 App resumed, sending heartbeat");
        beat();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [workerId, isOnline, beat]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);
}

/**
 * Check booking_requests for any pending requests for this worker.
 * This is the polling fallback layer when FCM/realtime are delayed.
 */
async function checkPendingBookingRequests(workerId: string) {
  try {
    const { data: requests, error } = await supabase
      .from("booking_requests")
      .select("id, booking_id, status, timeout_at")
      .eq("worker_id", workerId)
      .eq("status", "pending")
      .gt("timeout_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(3);

    if (error || !requests || requests.length === 0) return;

    console.log(`💓 [Heartbeat] Found ${requests.length} pending booking request(s)`);

    for (const req of requests) {
      // Fetch booking details
      const { data: booking } = await supabase
        .from("bookings")
        .select("id, cust_name, community, service_type, flat_no, price_inr, status, booking_type, scheduled_date, scheduled_time")
        .eq("id", req.booking_id)
        .maybeSingle();

      if (!booking || booking.status !== "pending") continue;
      logScheduledOfferDecision(booking, "heartbeat", true);

      await processIncomingBooking({
        bookingId: booking.id,
        bookingRequestId: req.id,
        custName: booking.cust_name || "Customer",
        community: booking.community || "",
        serviceType: booking.service_type || "",
        flatNo: booking.flat_no || "",
        priceInr: booking.price_inr ?? 0,
        bookingType: booking.booking_type,
        scheduledDate: booking.scheduled_date ?? undefined,
        scheduledTime: booking.scheduled_time ?? undefined,
        timeoutAt: req.timeout_at,
        source: "heartbeat",
      });
    }
  } catch (e) {
    console.warn("💓 [Heartbeat] Pending check failed:", e);
  }
}
