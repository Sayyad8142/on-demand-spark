/**
 * BookingAlertCoordinator — Single source of truth for booking alert state.
 *
 * All receive paths (FCM, Realtime booking_requests, Realtime bookings,
 * heartbeat fallback) funnel through this coordinator. It deduplicates
 * alerts, checks staleness, and emits a single event when a genuinely
 * new booking request needs to be shown to the worker.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  canShowWorkerBookingOffer,
  isBeforeScheduledDispatchWindow,
  logScheduledOfferDecision,
  type ScheduledOfferLogSource,
} from "@/lib/scheduledBookingGuards";

export interface BookingAlert {
  bookingId: string;
  bookingRequestId?: string;
  custName: string;
  community: string;
  serviceType: string;
  flatNo: string;
  priceInr: number;
  bookingType?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  prealertSent?: boolean;
  requestStatus?: string;
  timeoutAt?: string;
  source: "fcm" | "realtime_bookings" | "realtime_requests" | "heartbeat" | "resume" | "recovery";
}

const sourceForLog: Record<BookingAlert["source"], ScheduledOfferLogSource> = {
  fcm: "fcm",
  realtime_bookings: "realtime",
  realtime_requests: "realtime",
  heartbeat: "heartbeat",
  resume: "resume",
  recovery: "recovery",
};

type AlertListener = (alert: BookingAlert) => void;
type DismissListener = (bookingId: string) => void;

// Singleton state
// Durable state: key is authUid::bookingRequestId, value is timestamp
const STORAGE_KEY = "didi_shown_bookings";
const shownBookingRequestIds = new Set<string>();
const ackedReceived = new Set<string>();
const ackedOpened = new Set<string>();

// Initialize from storage for durability across process restarts
async function initStorage() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Keep only last 48h to prevent unbounded growth
      const threshold = Date.now() - 48 * 3600 * 1000;
      const prefix = `${user.id}::`;
      
      Object.entries(parsed).forEach(([key, ts]) => {
        // Only load entries for the current user
        if (key.startsWith(prefix) && (ts as number) > threshold) {
          shownBookingRequestIds.add(key);
        }
      });
    }
  } catch (e) {
    console.warn("[Coordinator] Storage restore failed", e);
  }
}

// Trigger initial load
initStorage();

async function persistShown() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const stored = localStorage.getItem(STORAGE_KEY);
    let data: Record<string, number> = {};
    if (stored) {
      try {
        data = JSON.parse(stored);
      } catch {}
    }

    shownBookingRequestIds.forEach(key => {
      data[key] = Date.now();
    });

    // Prune old entries from other users too if we are here
    const threshold = Date.now() - 48 * 3600 * 1000;
    Object.keys(data).forEach(k => {
      if (data[k] < threshold) delete data[k];
    });

    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error("[Coordinator] Persist failed", e);
  }
}

let currentAlert: BookingAlert | null = null;
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
  import("@/lib/fcmAckTracker").then(({ resolveFcmOffer }) =>
    resolveFcmOffer(bookingId, "dismissed")
  ).catch(() => {});
}

export function clearAlertState() {
  currentAlert = null;
}

/**
 * Core entry point — called by every receive path.
 * Returns true if the alert was shown (new), false if deduplicated/stale.
 */
export async function processIncomingBooking(alert: BookingAlert): Promise<boolean> {
  const { bookingId, bookingRequestId } = alert;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  // Deduplication key: authUid::bookingRequestId (fall back to bookingId if request id missing)
  const dedupeKey = `${user.id}::${bookingRequestId || bookingId}`;

  const { data: worker } = await supabase
    .from("workers")
    .select("id, payout_ready")
    .or(`user_id.eq.${user.id},id.eq.${user.id}`)
    .maybeSingle();

  if (worker?.payout_ready !== true) {
    console.log(`🔕 [Coordinator] Booking hidden because payout_not_ready: ${bookingId}`);
    return false;
  }

  // Dedup: already shown or currently showing
  if (shownBookingRequestIds.has(dedupeKey)) {
    console.log(`🔕 [Coordinator] Dedup: ${dedupeKey} already shown (source: ${alert.source})`);
    return false;
  }

  if (currentAlert?.bookingId === bookingId && currentAlert?.bookingRequestId === bookingRequestId) {
    console.log(`🔕 [Coordinator] Dedup: ${dedupeKey} currently showing`);
    return false;
  }

  // Check staleness: verify booking is still pending and not already accepted
  try {
    const { data: booking } = await supabase
      .from("bookings")
      .select("status, worker_id, booking_type, scheduled_date, scheduled_time, prealert_sent")
      .eq("id", bookingId)
      .maybeSingle();

    if (booking) {
      alert.bookingType = alert.bookingType ?? booking.booking_type;
      alert.scheduledDate = alert.scheduledDate ?? booking.scheduled_date ?? undefined;
      alert.scheduledTime = alert.scheduledTime ?? booking.scheduled_time ?? undefined;
      alert.prealertSent = alert.prealertSent ?? booking.prealert_sent ?? undefined;

      if (!canShowWorkerBookingOffer(alert)) {
        logScheduledOfferDecision(alert, sourceForLog[alert.source], false);
        console.log(`🔕 [Coordinator] Scheduled offer hidden until prealert_sent=true: ${bookingId}`);
        return false;
      }

      const hasActiveRequest = !!alert.bookingRequestId;
      const earlyScheduledOffer = !hasActiveRequest && isBeforeScheduledDispatchWindow({
        bookingId,
        booking_type: alert.bookingType,
        scheduled_date: alert.scheduledDate,
        scheduled_time: alert.scheduledTime,
        prealertSent: alert.prealertSent,
        requestStatus: alert.requestStatus,
      });

      if (earlyScheduledOffer) {
        logScheduledOfferDecision(alert, sourceForLog[alert.source], false);
        console.log(`🔕 [Coordinator] Early scheduled offer blocked: ${bookingId}`);
        return false;
      }
    }

    if (booking && booking.status !== "pending") {
      console.log(`🔕 [Coordinator] Stale: ${bookingId} status=${booking.status}`);
      shownBookingRequestIds.add(dedupeKey);
      return false;
    }

    if (booking?.worker_id) {
      console.log(`🔕 [Coordinator] Already assigned: ${bookingId}`);
      shownBookingRequestIds.add(dedupeKey);
      return false;
    }
  } catch (e) {
    // Network error — show anyway to avoid missing bookings
    console.warn(`⚠️ [Coordinator] Staleness check failed, showing anyway`, e);
  }

  // Mark as shown and persist
  shownBookingRequestIds.add(dedupeKey);
  persistShown();
  currentAlert = alert;

  console.log(`🔔 [Coordinator] NEW alert: ${bookingId} (source: ${alert.source})`);
  logScheduledOfferDecision(alert, sourceForLog[alert.source], true);

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
      appVersion: alert.source === "fcm" ? "6.0.63" : undefined // Traceable
    })
  ).catch(() => {});

  // Resolve any pending FCM ack-timeout tracker for this booking.
  import("@/lib/fcmAckTracker").then(({ resolveFcmOffer }) =>
    resolveFcmOffer(alert.bookingId, "popup_shown")
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
  let changed = false;
  if (shownBookingRequestIds.size > maxSize) {
    const arr = Array.from(shownBookingRequestIds);
    const toRemove = arr.slice(0, arr.length - maxSize);
    toRemove.forEach((id) => shownBookingRequestIds.delete(id));
    changed = true;
  }
  if (changed) persistShown();
  
  if (ackedReceived.size > maxSize) {
    const arr = Array.from(ackedReceived);
    arr.slice(0, arr.length - maxSize).forEach((k) => ackedReceived.delete(k));
  }
  if (ackedOpened.size > maxSize) {
    const arr = Array.from(ackedOpened);
    arr.slice(0, arr.length - maxSize).forEach((k) => ackedOpened.delete(k));
  }
}
