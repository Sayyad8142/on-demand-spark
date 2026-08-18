import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { tryAccept, rejectBooking } from "@/lib/bookingActions";
import { toast } from "@/hooks/use-toast";
import { Capacitor } from "@capacitor/core";
import {
  BookingAlert,
  processIncomingBooking,
  onNewAlert,
  dismissAlert,
  markAlertOpened,
  pruneShownBookings,
} from "@/services/bookingAlertCoordinator";
import { canShowWorkerBookingOffer, isBeforeScheduledDispatchWindow, logScheduledOfferDecision } from "@/lib/scheduledBookingGuards";

/**
 * Unified booking alert hook that:
 * 1. Listens to coordinator for new alerts (from any source)
 * 2. Shows the alert UI (web modal or native overlay)
 * 3. Handles accept/reject
 * 4. Integrates with existing bookings realtime (Layer 1 via FCM handled elsewhere)
 *
 * Also sets up the bookings INSERT realtime listener as before, but routes
 * through the coordinator for dedup.
 */
export function useUnifiedBookingAlerts(
  userId: string | undefined,
  isOnline: boolean,
  match: (b: any) => boolean,
  workerId?: string | null
) {
  const [pending, setPending] = useState<BookingAlert | null>(null);
  const matchRef = useRef(match);
  matchRef.current = match;

  // Listen to coordinator for alerts from ALL sources
  useEffect(() => {
    const unsub = onNewAlert((alert) => {
      console.log("🔔 [UnifiedAlerts] New alert from coordinator:", alert.bookingId);
      setPending(alert);
      markAlertOpened(alert.bookingId);

      // Trigger native Android overlay if available
      if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
        try {
          const plugin = (window as any)?.Capacitor?.Plugins?.OverlayPlugin;
          if (plugin?.showBookingOverlay) {
            const bookingJson = JSON.stringify({
              id: alert.bookingId,
              cust_name: alert.custName,
              community: alert.community,
              service_type: alert.serviceType,
              flat_no: alert.flatNo,
              price_inr: alert.priceInr,
              booking_type: alert.bookingType,
              scheduled_date: alert.scheduledDate,
              scheduled_time: alert.scheduledTime,
              prealert_sent: alert.prealertSent === true,
            });
            console.log("🚀 Triggering native overlay from coordinator");
            plugin.showBookingOverlay({ booking: bookingJson });
          }
        } catch (err) {
          console.error("❌ Native overlay trigger failed:", err);
        }
      }

      toast({ title: "New booking available" });
    });

    return unsub;
  }, []);

  // Layer 1 (existing): bookings table INSERT listener for backward compat
  useEffect(() => {
    if (!userId || !isOnline) return;

    const channel = supabase
      .channel("booking-alerts-unified")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "bookings",
          filter: "status=eq.pending",
        },
        async (payload) => {
          const b = payload.new as any;
          if (matchRef.current(b)) {
            if (isBeforeScheduledDispatchWindow(b)) {
              logScheduledOfferDecision(b, "realtime", false);
              return;
            }
            await processIncomingBooking({
              bookingId: b.id,
              custName: b.cust_name || "Customer",
              community: b.community || "",
              serviceType: b.service_type || "",
              flatNo: b.flat_no || "",
              priceInr: b.price_inr ?? 0,
              bookingType: b.booking_type,
              scheduledDate: b.scheduled_date,
              scheduledTime: b.scheduled_time,
              source: "realtime_bookings",
            });
          }
        }
      )
      // Listen for booking status changes to dismiss stale alerts
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "bookings",
          filter: "status=eq.assigned",
        },
        (payload) => {
          const b = payload.new as any;
          if (pending?.bookingId === b.id) {
            console.log("🔕 [UnifiedAlerts] Booking assigned, dismissing alert");
            dismissAlert(b.id);
            setPending(null);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, isOnline]);

  // Periodic prune to prevent memory leak
  useEffect(() => {
    const interval = setInterval(pruneShownBookings, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // On app resume, reconnect, or periodic interval: fetch currently valid offers
  const fetchValidOffers = useCallback(async () => {
    if (!workerId || !isOnline) return;
    if (document.visibilityState !== "visible" && Capacitor.isNativePlatform()) return;
    
    console.log("📱 [UnifiedAlerts] Fetching valid offers from server...");

    try {
      const { data: requests } = await supabase
        .from("booking_requests")
        .select("id, booking_id, timeout_at, status")
        .eq("worker_id", workerId)
        .eq("status", "pending")
        .gt("timeout_at", new Date().toISOString())
        .limit(5);

      if (!requests?.length) return;

      for (const req of requests) {
        const { data: booking } = await supabase
          .from("bookings")
          .select("id, cust_name, community, service_type, flat_no, price_inr, status, booking_type, scheduled_date, scheduled_time, prealert_sent")
          .eq("id", req.booking_id)
          .maybeSingle();

        if (booking?.status === "pending") {
          const offerLogInput = { ...booking, request_status: req.status };
          if (!canShowWorkerBookingOffer(offerLogInput)) {
            logScheduledOfferDecision(offerLogInput, "recovery", false);
            continue;
          }

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
            prealertSent: booking.prealert_sent ?? undefined,
            requestStatus: req.status ?? undefined,
            timeoutAt: req.timeout_at,
            source: "recovery",
          });
        }
      }
    } catch (e) {
      console.warn("📱 [UnifiedAlerts] Offer recovery failed:", e);
    }
  }, [workerId, isOnline]);

  useEffect(() => {
    if (!workerId || !isOnline) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchValidOffers();
      }
    };

    const handleOnline = () => {
      fetchValidOffers();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);
    
    // Recovery interval while app is open
    const recoveryInterval = setInterval(fetchValidOffers, 30000);
    
    // Initial fetch
    fetchValidOffers();

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
      clearInterval(recoveryInterval);
    };
  }, [workerId, isOnline, fetchValidOffers]);

  const clearAlert = useCallback(() => {
    if (pending) dismissAlert(pending.bookingId);
    setPending(null);
  }, [pending]);

  const accept = useCallback(async () => {
    if (!pending) return;

    const result = await tryAccept(pending.bookingId, workerId || undefined);
    if (!result.success) {
      toast({ title: result.error || "Booking already taken", variant: "destructive" });
    } else {
      toast({ title: "Booking accepted" });
    }

    dismissAlert(pending.bookingId);
    setPending(null);
  }, [pending, workerId]);

  const reject = useCallback(async () => {
    if (!pending || !userId) return;

    // Use workerId for rejection, fall back to userId
    const rejectId = workerId || userId;
    const result = await rejectBooking(pending.bookingId, rejectId);
    if (result.success) {
      if (result.shouldNotify) {
        toast({ title: "Booking offered to next available workers" });
      } else {
        toast({ title: "Booking rejected" });
      }
    }

    dismissAlert(pending.bookingId);
    setPending(null);
  }, [pending, userId, workerId]);

  // Convert BookingAlert to the shape expected by SimulatedOverlayModal
  const pendingForModal = pending
    ? {
        id: pending.bookingId,
        service_type: pending.serviceType,
        cust_name: pending.custName,
        community: pending.community,
        flat_no: pending.flatNo,
        price_inr: pending.priceInr,
      }
    : null;

  return { pending: pendingForModal, accept, reject, clearAlert };
}
