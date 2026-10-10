import { supabase } from "@/integrations/supabase/client";
import { canShowWorkerBookingOffer, isBeforeScheduledDispatchWindow, logScheduledOfferDecision } from "@/lib/scheduledBookingGuards";
import { ackBookingDelivery } from "@/lib/bookingAck";

// Helper to ensure session is valid before making API calls
async function ensureValidSession(): Promise<boolean> {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error || !session) {
      console.error('❌ No valid session for API call');
      return false;
    }
    
    // Check if token is about to expire (within 2 minutes)
    const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
    const twoMinutes = 2 * 60 * 1000;
    
    if (Date.now() > expiresAt - twoMinutes) {
      console.log('🔄 Token expiring, refreshing before API call...');
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        console.error('❌ Failed to refresh session:', refreshError);
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error checking session:', error);
    return false;
  }
}

export async function tryAccept(bookingId: string, workerId?: string): Promise<{ success: boolean; error?: string }> {
  // Ensure valid session before accepting
  const sessionValid = await ensureValidSession();
  if (!sessionValid) {
    return { success: false, error: "Session expired. Please log in again." };
  }

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, booking_type, scheduled_date, scheduled_time, prealert_sent")
    .eq("id", bookingId)
    .maybeSingle();

  if (booking && !canShowWorkerBookingOffer(booking)) {
    logScheduledOfferDecision(booking, "query", false);
    return { success: false, error: "Scheduled booking is not open for acceptance yet." };
  }

  const { data: activeRequest } = await supabase
    .from("booking_requests")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("status", "pending")
    .gt("timeout_at", new Date().toISOString())
    .maybeSingle();

  if (!activeRequest) {
    if (booking && isBeforeScheduledDispatchWindow(booking)) {
      logScheduledOfferDecision(booking, "query", false);
      return { success: false, error: "Scheduled booking is not open for acceptance yet." };
    }
  }
  
  // ACK that the worker tapped Accept (fire-and-forget, never blocks)
  ackBookingDelivery({ bookingId, event: "worker_seen" }).catch(() => {});
  ackBookingDelivery({ bookingId, event: "accept_tapped" }).catch(() => {});

  const { data, error } = await supabase.rpc("try_accept_booking", { p_booking_id: bookingId });
  
  if (error) {
    console.error("❌ RPC error accepting booking:", error);
    return { success: false, error: error.message };
  }
  
  const result = data as { success?: boolean; error?: string } | null;
  
  if (!result?.success) {
    console.error("❌ Booking accept failed:", result?.error);
    return { success: false, error: result?.error || "Failed to accept booking" };
  }
  
  console.log("✅ Booking accepted successfully");

  // Movement tracking is started by the global active-job effect in App.tsx
  // (single source of truth). Do NOT start it from here — duplicate starts
  // tear down the native step-event listener mid-session.

  return { success: true };
}

export type RejectResult = {
  success: boolean;
  shouldNotify: boolean;
  /** true when the offer is gone (expired / taken) — safe to close the popup */
  offerGone?: boolean;
  error?: string;
};

/**
 * Reject an offer. Success is reported ONLY when the backend confirms it.
 * The worker is resolved server-side from the signed-in session
 * (reject_booking_offer), never from a client-supplied id.
 */
export async function rejectBooking(bookingId: string, _workerId?: string): Promise<RejectResult> {
  // Record the tap first — independent of whether the rejection is confirmed.
  ackBookingDelivery({ bookingId, event: "worker_seen" }).catch(() => {});
  ackBookingDelivery({ bookingId, event: "reject_tapped" }).catch(() => {});

  const sessionValid = await ensureValidSession();
  if (!sessionValid) {
    return { success: false, shouldNotify: false, error: "session-expired" };
  }

  let { data, error } = await supabase.rpc("reject_booking_offer" as any, { p_booking_id: bookingId });
  // Expired token race: refresh once and retry.
  if (error && /jwt|401|expired/i.test(error.message)) {
    const { error: refreshErr } = await supabase.auth.refreshSession();
    if (refreshErr) return { success: false, shouldNotify: false, error: "session-expired" };
    ({ data, error } = await supabase.rpc("reject_booking_offer" as any, { p_booking_id: bookingId }));
  }

  if (error) {
    console.error("❌ Error rejecting booking:", error);
    return { success: false, shouldNotify: false, error: "network" };
  }

  const result = data as { success?: boolean; confirmed?: boolean; error?: string; should_notify?: boolean; next_tier?: number };
  if (!result?.success || !result?.confirmed) {
    const err = result?.error || "unknown";
    const offerGone = ["offer-expired", "booking-already-accepted", "offer-closed", "request-not-found"].includes(err);
    return { success: false, shouldNotify: false, offerGone, error: err };
  }

  // If next tier should be notified, call the edge function
  if (result?.should_notify && result?.next_tier) {
    try {
      await supabase.functions.invoke("notify-next-tier", {
        body: {
          booking_id: bookingId,
          tier: result.next_tier,
        },
      });
      console.log(`✅ Notified next tier ${result.next_tier}`);
    } catch (notifyError) {
      console.error("⚠️ Error notifying next tier:", notifyError);
      // Don't fail the rejection if notification fails
    }
  }

  return { success: true, shouldNotify: result?.should_notify || false };
}
