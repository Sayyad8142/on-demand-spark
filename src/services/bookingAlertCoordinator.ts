/**
 * BookingAlertCoordinator — Single source of truth for booking alert state.
 *
 * All receive paths (FCM, Realtime booking_requests, Realtime bookings,
 * heartbeat fallback) funnel through this coordinator. It deduplicates
 * alerts, checks staleness, and emits a single event when a genuinely
 * new booking request needs to be shown to the worker.
 */

import { supabase } from "@/integrations/supabase/client";

export interface BookingAlert {
  bookingId: string;
  bookingRequestId?: string;
  custName: string;
  community: string;
  serviceType: string;
  flatNo: string;
  priceInr: number;
  timeoutAt?: string;
  source: "fcm" | "realtime_bookings" | "realtime_requests" | "heartbeat" | "resume";
}

type AlertListener = (alert: BookingAlert) => void;
type DismissListener = (bookingId: string) => void;

// Singleton state
let currentAlert: BookingAlert | null = null;
const shownBookingIds = new Set<string>();
const ackedReceived = new Set<string>();
const ackedOpened = new Set<string>();
const listeners: Set<AlertListener> = new Set();
const dismissListeners: Set<DismissListener> = new Set();

export function onNewAlert(listener: AlertListener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function onAlertDismissed(listener: DismissListener) {
  dismissListeners.add(listener);
  return () => { dismissListeners.delete(listener); };
}

export function getCurrentAlert(): BookingAlert | null {
  return currentAlert;
}

export function dismissAlert(bookingId: string) {
  if (currentAlert?.bookingId === bookingId) {
    currentAlert = null;
  }
  dismissListeners.forEach((l) => l(bookingId));
}

export function clearAlertState() {
  currentAlert = null;
}

/**
 * Core entry point — called by every receive path.
 * Returns true if the alert was shown (new), false if deduplicated/stale.
 */
export async function processIncomingBooking(alert: BookingAlert): Promise<boolean> {
  const { bookingId } = alert;

  // Dedup: already shown or currently showing
  if (shownBookingIds.has(bookingId)) {
    console.log(`🔕 [Coordinator] Dedup: ${bookingId} already shown (source: ${alert.source})`);
    return false;
  }

  if (currentAlert?.bookingId === bookingId) {
    console.log(`🔕 [Coordinator] Dedup: ${bookingId} currently showing`);
    return false;
  }

  // Check staleness: verify booking is still pending and not already accepted
  try {
    const { data: booking } = await supabase
      .from("bookings")
      .select("status, worker_id")
      .eq("id", bookingId)
      .maybeSingle();

    if (booking && booking.status !== "pending") {
      console.log(`🔕 [Coordinator] Stale: ${bookingId} status=${booking.status}`);
      shownBookingIds.add(bookingId);
      return false;
    }

    if (booking?.worker_id) {
      console.log(`🔕 [Coordinator] Already assigned: ${bookingId}`);
      shownBookingIds.add(bookingId);
      return false;
    }
  } catch (e) {
    // Network error — show anyway to avoid missing bookings
    console.warn(`⚠️ [Coordinator] Staleness check failed, showing anyway`, e);
  }

  // Mark as shown
  shownBookingIds.add(bookingId);
  currentAlert = alert;

  console.log(`🔔 [Coordinator] NEW alert: ${bookingId} (source: ${alert.source})`);

  // Notify all listeners
  listeners.forEach((l) => l(alert));

  // Send delivery "received" acknowledgment (legacy table)
  sendDeliveryAck(alert, "received");

  // NEW: also stamp booking_requests.popup_shown_at via the new ACK function
  import("@/lib/bookingAck").then(({ ackBookingDelivery }) =>
    ackBookingDelivery({
      bookingId: alert.bookingId,
      bookingRequestId: alert.bookingRequestId,
      event: "popup_shown",
    })
  ).catch(() => {});

  return true;
}

/**
 * Send delivery acknowledgment (received/opened) to booking_request_delivery_events
 */
export async function sendDeliveryAck(
  alert: Pick<BookingAlert, "bookingId" | "bookingRequestId">,
  eventType: "received" | "opened"
) {
  const key = `${alert.bookingId}:${eventType}`;
  const ackSet = eventType === "received" ? ackedReceived : ackedOpened;

  if (ackSet.has(key)) return; // Already sent
  ackSet.add(key);

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Resolve worker_id
    const { data: worker } = await supabase
      .from("workers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!worker) return;

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("booking_request_delivery_events")
      .insert({
        booking_id: alert.bookingId,
        worker_id: worker.id,
        received_on_device: true,
        app_state: document.visibilityState === "visible" ? "foreground" : "background",
        app_version: String((await import("@/config/version")).CURRENT_VERSION_CODE),
        booking_request_id: alert.bookingRequestId || null,
        received_at: eventType === "received" ? now : null,
        opened_at: eventType === "opened" ? now : null,
      });

    if (error) {
      console.warn(`⚠️ [Coordinator] Ack ${eventType} insert failed:`, error.message);
      ackSet.delete(key); // Allow retry
    } else {
      console.log(`✅ [Coordinator] Ack ${eventType} sent for ${alert.bookingId}`);
    }
  } catch (e) {
    console.error(`❌ [Coordinator] Ack error:`, e);
    ackSet.delete(`${alert.bookingId}:${eventType}`);
  }
}

/**
 * Mark that the alert UI has been opened/shown to the worker.
 */
export function markAlertOpened(bookingId: string, bookingRequestId?: string) {
  sendDeliveryAck({ bookingId, bookingRequestId }, "opened");
  // NEW: also stamp booking_requests.worker_seen_at
  import("@/lib/bookingAck").then(({ ackBookingDelivery }) =>
    ackBookingDelivery({ bookingId, bookingRequestId, event: "worker_seen" })
  ).catch(() => {});
}

/**
 * Cleanup old entries from shownBookingIds to prevent memory leak.
 * Called periodically.
 */
export function pruneShownBookings(maxSize = 200) {
  if (shownBookingIds.size > maxSize) {
    const arr = Array.from(shownBookingIds);
    const toRemove = arr.slice(0, arr.length - maxSize);
    toRemove.forEach((id) => shownBookingIds.delete(id));
  }
  if (ackedReceived.size > maxSize) {
    const arr = Array.from(ackedReceived);
    arr.slice(0, arr.length - maxSize).forEach((k) => ackedReceived.delete(k));
  }
  if (ackedOpened.size > maxSize) {
    const arr = Array.from(ackedOpened);
    arr.slice(0, arr.length - maxSize).forEach((k) => ackedOpened.delete(k));
  }
}
