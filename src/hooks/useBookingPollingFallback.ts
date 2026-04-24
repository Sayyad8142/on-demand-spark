/**
 * Polling backup for booking alerts.
 *
 * The Worker App can't rely solely on FCM — pushes get throttled by OEM
 * battery savers, the device may be offline, or the realtime channel may
 * have silently disconnected. This hook polls the server-side
 * `get-pending-worker-bookings` endpoint and routes any active request
 * through the same coordinator FCM/realtime use, so the user sees one
 * unified alert.
 *
 * Cadence (user-confirmed):
 *   - on app open
 *   - on app resume (visibilitychange / Capacitor appStateChange)
 *   - every 10s while worker is online + foregrounded
 *   - every 30s while worker is online + app is backgrounded but alive
 */

import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { supabase } from "@/integrations/supabase/client";
import { processIncomingBooking } from "@/services/bookingAlertCoordinator";

const POLL_FOREGROUND_MS = 10_000;
const POLL_BACKGROUND_MS = 30_000;

interface PendingItem {
  booking_request_id: string;
  booking_id: string;
  status: string;
  timeout_at: string;
  booking: {
    id: string;
    service_type: string | null;
    community: string | null;
    cust_name: string | null;
    flat_no: string | null;
    price_inr: number | null;
  };
}

export function useBookingPollingFallback(workerId: string | undefined | null, isOnline: boolean) {
  const intervalRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  const isForegroundRef = useRef(true);

  useEffect(() => {
    if (!workerId || !isOnline) {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const pollOnce = async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const { data, error } = await supabase.functions.invoke("get-pending-worker-bookings", {
          body: {},
        });
        if (error) {
          console.warn("[Polling] get-pending-worker-bookings error:", error.message);
          return;
        }
        const items: PendingItem[] = (data as any)?.pending ?? [];
        if (!items.length) return;

        console.log(`[Polling] Found ${items.length} pending booking(s) via fallback`);
        for (const item of items) {
          await processIncomingBooking({
            bookingId: item.booking.id,
            bookingRequestId: item.booking_request_id,
            custName: item.booking.cust_name || "Customer",
            community: item.booking.community || "",
            serviceType: item.booking.service_type || "",
            flatNo: item.booking.flat_no || "",
            priceInr: item.booking.price_inr ?? 0,
            timeoutAt: item.timeout_at,
            source: "heartbeat",
          });
        }
      } catch (e) {
        console.warn("[Polling] poll threw:", e);
      } finally {
        inFlightRef.current = false;
      }
    };

    const restartInterval = () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      const period = isForegroundRef.current ? POLL_FOREGROUND_MS : POLL_BACKGROUND_MS;
      intervalRef.current = window.setInterval(pollOnce, period);
      console.log(`[Polling] interval = ${period}ms (${isForegroundRef.current ? "foreground" : "background"})`);
    };

    // 1. Poll once immediately on app open / hook mount
    pollOnce();
    restartInterval();

    // 2. Web: visibilitychange
    const onVis = () => {
      const visible = document.visibilityState === "visible";
      isForegroundRef.current = visible;
      restartInterval();
      if (visible) pollOnce(); // immediate check on resume
    };
    document.addEventListener("visibilitychange", onVis);

    // 3. Native: Capacitor appStateChange
    let nativeSub: { remove: () => void } | null = null;
    if (Capacitor.isNativePlatform()) {
      CapApp.addListener("appStateChange", (s) => {
        isForegroundRef.current = s.isActive;
        restartInterval();
        if (s.isActive) pollOnce();
      }).then((sub) => { nativeSub = sub; });
    }

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      document.removeEventListener("visibilitychange", onVis);
      nativeSub?.remove();
    };
  }, [workerId, isOnline]);
}
