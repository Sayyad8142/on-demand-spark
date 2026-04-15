import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { processIncomingBooking, dismissAlert } from "@/services/bookingAlertCoordinator";

/**
 * Realtime subscription on booking_requests table for this worker.
 * This is Layer 2 of the multi-layer receive system.
 * When a new booking_request row is inserted for this worker, it triggers
 * the centralized alert coordinator.
 */
export function useBookingRequestsRealtime(
  workerId: string | undefined | null,
  isOnline: boolean
) {
  useEffect(() => {
    if (!workerId || !isOnline) return;

    console.log("📡 [BookingRequests] Setting up realtime for worker:", workerId);

    const channel = supabase
      .channel(`booking-requests:${workerId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "booking_requests",
          filter: `worker_id=eq.${workerId}`,
        },
        async (payload) => {
          const req = payload.new as any;
          console.log("📡 [BookingRequests] New request:", req.id, "booking:", req.booking_id);

          if (req.status !== "pending") {
            console.log("📡 [BookingRequests] Non-pending status, skipping");
            return;
          }

          // Check if already timed out
          if (req.timeout_at && new Date(req.timeout_at) < new Date()) {
            console.log("📡 [BookingRequests] Already timed out, skipping");
            return;
          }

          // Fetch booking details
          const { data: booking } = await supabase
            .from("bookings")
            .select("id, cust_name, community, service_type, flat_no, price_inr, status")
            .eq("id", req.booking_id)
            .maybeSingle();

          if (!booking || booking.status !== "pending") {
            console.log("📡 [BookingRequests] Booking not pending, skipping");
            return;
          }

          await processIncomingBooking({
            bookingId: booking.id,
            bookingRequestId: req.id,
            custName: booking.cust_name || "Customer",
            community: booking.community || "",
            serviceType: booking.service_type || "",
            flatNo: booking.flat_no || "",
            priceInr: booking.price_inr ?? 0,
            timeoutAt: req.timeout_at,
            source: "realtime_requests",
          });
        }
      )
      // Also listen for booking_request status changes (e.g., another worker accepted)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "booking_requests",
          filter: `worker_id=eq.${workerId}`,
        },
        (payload) => {
          const req = payload.new as any;
          if (req.status !== "pending") {
            dismissAlert(req.booking_id);
          }
        }
      )
      .subscribe((status) => {
        console.log("📡 [BookingRequests] Subscription:", status);
      });

    return () => {
      console.log("📡 [BookingRequests] Cleaning up realtime");
      supabase.removeChannel(channel);
    };
  }, [workerId, isOnline]);
}
