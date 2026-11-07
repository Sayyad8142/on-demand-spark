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
  invalidateOffer,
  markAlertOpened,
  markAlertRendered,
  markAcceptedByMe,
  isOwnAcceptance,
  pruneShownBookings,
} from "@/services/bookingAlertCoordinator";
import { canShowWorkerBookingOffer, isBeforeScheduledDispatchWindow, logScheduledOfferDecision } from "@/lib/scheduledBookingGuards";
import { isVillaCommunity } from "@/lib/communityTypes";
import { classifyAcceptResult, canRetryAccept } from "@/lib/acceptOutcome";
import { claimDeviceAcceptance, releaseDeviceAcceptance } from "@/lib/deviceAcceptLock";
import { postBookingAlertFallback } from "@/lib/bookingAlertFallback";
import { formatVillaLabel } from "@/lib/address";

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
      markAlertOpened(alert.bookingId, alert.bookingRequestId);

      // Trigger native Android overlay if available. The native pop-up sends
      // its own popup_shown ACK once it renders. If it cannot open (call
      // rejected, plugin missing), the in-app alert renders here and a backup
      // notification is posted so the worker still hears the offer.
      const showInApp = () => markAlertRendered(alert.bookingId, alert.bookingRequestId);
      const plugin = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android"
        ? (window as any)?.Capacitor?.Plugins?.OverlayPlugin
        : null;
      if (plugin?.showBookingOverlay) {
        const bookingJson = JSON.stringify({
          id: alert.bookingId,
          booking_request_id: alert.bookingRequestId,
          cust_name: alert.custName,
          community: alert.community,
          service_type: alert.serviceType,
          flat_no: alert.flatNo,
          // Villa-aware display info (presentation only)
          is_villa: isVillaCommunity(alert.community),
          unit_label: isVillaCommunity(alert.community)
            ? formatVillaLabel(alert.flatNo)
            : `Flat #${alert.flatNo}`,
          price_inr: alert.priceInr,
          booking_type: alert.bookingType,
          scheduled_date: alert.scheduledDate,
          scheduled_time: alert.scheduledTime,
          prealert_sent: alert.prealertSent === true,
        });
        console.log("🚀 Triggering native overlay from coordinator");
        Promise.resolve()
          .then(() => plugin.showBookingOverlay({ booking: bookingJson }))
          .catch((err: unknown) => {
            console.error("❌ Native overlay trigger failed:", err instanceof Error ? err.message : err);
            showInApp();
            void postBookingAlertFallback(alert);
          });
      } else {
        showInApp();
      }

      toast({ title: "New booking available" });
    });


    return unsub;
  }, []);

  // Offers arrive through ONE coordinated system: booking_requests realtime
  // (useBookingRequestsRealtime), FCM, and the server polling backup
  // (useBookingPollingFallback, which also re-checks on resume / reconnect).
  // The old bookings-INSERT listener was removed: it duplicated those paths
  // and could surface bookings this worker was never offered (bypassing
  // dispatch order / favorite-worker priority). This channel now only closes
  // offers that another worker won.
  useEffect(() => {
    if (!userId || !isOnline) return;

    const channel = supabase
      .channel("booking-alerts-unified")
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
          // Our own acceptance assigned it — do not close our own booking.
          if (isOwnAcceptance(b.id)) {
            console.log("🛡️ [UnifiedAlerts] Assigned to this worker, keeping state", b.id);
            return;
          }
          // Assigned to someone — close this offer everywhere on this device
          // (web state + native popup/countdown/queue/tray). Idempotent.
          console.log("🔕 [UnifiedAlerts] Booking assigned, invalidating offer", b.id);
          invalidateOffer(b.id, pending?.bookingId === b.id ? pending?.bookingRequestId : undefined);
          if (pending?.bookingId === b.id) {
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

  const clearAlert = useCallback(() => {
    if (pending) dismissAlert(pending.bookingId);
    setPending(null);
  }, [pending]);

  const accept = useCallback(async () => {
    if (!pending) return;

    const bookingId = pending.bookingId;
    // Never extend an expired offer: once the server window has passed, close it.
    if (!canRetryAccept(pending.timeoutAt)) {
      invalidateOffer(bookingId, pending.bookingRequestId);
      dismissAlert(bookingId);
      setPending(null);
      toast({ title: "This offer has expired" });
      return;
    }
    // Single flight across this screen, the pop-up and the full-screen alert.
    if (!(await claimDeviceAcceptance(bookingId))) {
      console.log("⚠️ [UnifiedAlerts] Accept ignored — already in flight", bookingId);
      return;
    }

    let outcome: ReturnType<typeof classifyAcceptResult> = "retry";
    let message: string | undefined;
    try {
      const result = await tryAccept(bookingId, workerId || undefined);
      outcome = classifyAcceptResult(result);
      message = result.error;
    } catch {
      outcome = "retry";
    }

    if (outcome === "won") {
      // Backend confirmed we won — protects against the assigned-listener
      // and the native poller closing our own booking as "taken".
      markAcceptedByMe(bookingId);
      await releaseDeviceAcceptance(bookingId, true);
      toast({ title: "Booking accepted" });
      dismissAlert(bookingId);
      setPending(null);
      return;
    }

    await releaseDeviceAcceptance(bookingId, false);

    if (outcome === "retry") {
      // Temporary problem — keep the still-valid offer so she can tap again.
      toast({ title: "Network problem. Please try again.", variant: "destructive" });
      return;
    }

    // closed / gone: close this offer everywhere on the phone. No retry.
    invalidateOffer(bookingId, pending.bookingRequestId);
    if (outcome === "closed") {
      window.dispatchEvent(new CustomEvent("bookingAcceptanceClosed", { detail: { bookingId } }));
      toast({ title: message, variant: "destructive" });
    } else {
      toast({ title: message || "Booking already taken", variant: "destructive" });
    }
    dismissAlert(bookingId);
    setPending(null);
  }, [pending, workerId]);

  const rejectingRef = useRef<string | null>(null);
  const reject = useCallback(async () => {
    if (!pending || !userId) return;
    // Single flight: repeated taps never send parallel rejections.
    if (rejectingRef.current === pending.bookingId) return;
    rejectingRef.current = pending.bookingId;
    try {

    const result = await rejectBooking(pending.bookingId);
    if (result.success) {
      toast({ title: result.shouldNotify ? "Booking offered to next available workers" : "Booking rejected" });
    } else if (result.offerGone) {
      toast({ title: result.error === "offer-expired" ? "This offer has expired" : "This booking is no longer available" });
    } else {
      // Not confirmed — keep the offer open so she can try again.
      toast({
        title: result.error === "session-expired" ? "Please log in again to reject" : "Couldn't reject. Please try again.",
        variant: "destructive",
      });
      return;
    }

    dismissAlert(pending.bookingId);
    setPending(null);
    } finally {
      rejectingRef.current = null;
    }
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
