import { supabase } from "@/integrations/supabase/client";
import { canShowWorkerBookingOffer, logScheduledOfferDecision } from "@/lib/scheduledBookingGuards";
import { ackBookingDelivery } from "@/lib/bookingAck";
import { isAcceptanceClosedError, ACCEPTANCE_CLOSED_MESSAGE } from "@/lib/acceptanceClosed";
import { offerAcceptanceRpc, FAVORITE_V1_STATUS_ENABLED, OFFER_STATUS_RPC } from '@/lib/offerAcceptanceContract';
import { parseFavoriteOfferStatus, favoriteLocalDeadline } from '@/lib/favoriteOfferStatus';

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

export async function tryAccept(
  bookingId: string,
  _workerId?: string,
  originalTimeoutAt?: string,
  originalRequestId?: string,
): Promise<{ success: boolean; error?: string; acceptanceClosed?: boolean; alreadyAccepted?: boolean }> {
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

  // Resolve from the login, never from a caller-supplied worker id.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) return { success: false, error: "Session expired. Please log in again." };
  const { data: worker, error: workerError } = await supabase.from("workers")
    .select("id").eq("user_id", session.user.id).maybeSingle();
  if (workerError) return { success: false, error: "Unable to check offer. Please try again." };
  if (!worker) return { success: false, error: "not-offered" };
  let deadline: number;
  if (FAVORITE_V1_STATUS_ENABLED) {
    const { data, error } = await (supabase.rpc as any)(OFFER_STATUS_RPC, { p_booking_id: bookingId });
    const status = !error && parseFavoriteOfferStatus(data, { bookingId, requestId: originalRequestId });
    const local = status && favoriteLocalDeadline(status, Date.now(), originalTimeoutAt ? Date.parse(originalTimeoutAt) : undefined);
    if (!local) return { success: false, error: "offer-closed" };
    deadline = local;
  } else {
  let requestQuery = supabase
    .from("booking_requests")
    .select("id, status, timeout_at")
    .eq("booking_id", bookingId)
    .eq("worker_id", worker.id);
  if (originalRequestId) requestQuery = requestQuery.eq('id', originalRequestId);
  const { data: activeRequest, error: requestError } = await requestQuery.maybeSingle();
  if (requestError) return { success: false, error: "Unable to check offer. Please try again." };
  if (!activeRequest || !["pending", "sent", "queued"].includes(activeRequest.status)) return { success: false, error: "not-offered" };
  const serverDeadline = Date.parse(activeRequest.timeout_at ?? "");
  const originalDeadline = originalTimeoutAt ? Date.parse(originalTimeoutAt) : serverDeadline;
  deadline = Math.min(serverDeadline, originalDeadline);
  if (!Number.isFinite(deadline)) return { success: false, error: "Unable to check offer. Please try again." };
  if (deadline <= Date.now()) return { success: false, error: "offer-expired" };
  }

  
  // ACK that the worker tapped Accept (fire-and-forget, never blocks)
  ackBookingDelivery({ bookingId, event: "worker_seen" }).catch(() => {});
  ackBookingDelivery({ bookingId, event: "accept_tapped" }).catch(() => {});

  // Recheck after asynchronous preflight; the server remains the final authority.
  if (deadline <= Date.now()) return { success: false, error: "offer-expired" };
  const { data, error } = await supabase.rpc(offerAcceptanceRpc(), { p_booking_id: bookingId });
  
  if (error) {
    if (isAcceptanceClosedError(error)) {
      // Outside operating hours — final answer, never retried.
      return { success: false, acceptanceClosed: true, error: ACCEPTANCE_CLOSED_MESSAGE };
    }
    console.error("❌ RPC error accepting booking:", error);
    return { success: false, error: error.message };
  }
  
  const result = data as { success?: boolean; error?: string; offer?: unknown; already_accepted?: unknown } | null;
  
  if (!result?.success) {
    console.error("❌ Booking accept failed:", result?.error);
    // favorite-v1 (additive): a server-confirmed non-actionable offer is closed, not retried.
    const offer = parseFavoriteOfferStatus(result?.offer, { bookingId, requestId: originalRequestId });
    if (offer && !offer.actionable) return { success: false, error: "offer-closed" };
    return { success: false, error: result?.error || "Failed to accept booking" };
  }
  
  console.log("✅ Booking accepted successfully");

  // Movement tracking is started by the global active-job effect in App.tsx
  // (single source of truth). Do NOT start it from here — duplicate starts
  // tear down the native step-event listener mid-session.

  return result.already_accepted === true ? { success: true, alreadyAccepted: true } : { success: true };
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

  // Escalation belongs exclusively to the server, not this phone.
  return { success: true, shouldNotify: false };
}
