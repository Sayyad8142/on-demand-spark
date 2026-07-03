/**
 * FCM Ack Timeout Tracker.
 *
 * When an FCM booking offer arrives, we start a countdown. If the popup
 * does not show and the worker never sees it within the expected window,
 * we report a missed-booking diagnostic — even if polling later recovers
 * the booking.
 *
 * Flow:
 *   fcm receives  → trackFcmOffer(bookingId, requestId)
 *   coordinator shows popup / worker sees it / booking dismissed
 *                 → resolveFcmOffer(bookingId, resolution)
 *   timer fires after ACK_TIMEOUT_MS with no resolution
 *                 → uploads diagnostic with reason=fcm_ack_timeout
 */

import { supabase } from "@/integrations/supabase/client";
import { reportMissedBooking } from "@/lib/missedBookingDiagnostics";

const ACK_TIMEOUT_MS = 20 * 1000; // 20s: FCM data payload → popup should be up

type Resolution = "popup_shown" | "worker_seen" | "dismissed" | "assigned_elsewhere";

interface PendingOffer {
  bookingId: string;
  bookingRequestId?: string;
  startedAt: number;
  timer: ReturnType<typeof setTimeout>;
}

const pending = new Map<string, PendingOffer>();

export function trackFcmOffer(bookingId: string, bookingRequestId?: string) {
  if (!bookingId) return;
  if (pending.has(bookingId)) return; // already tracking

  const timer = setTimeout(async () => {
    const entry = pending.get(bookingId);
    if (!entry) return;
    pending.delete(bookingId);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      let workerRowId: string | undefined;
      if (user) {
        const { data: w } = await supabase
          .from("workers")
          .select("id, last_notification_received_at")
          .or(`user_id.eq.${user.id},id.eq.${user.id}`)
          .maybeSingle();
        workerRowId = w?.id;
      }

      void reportMissedBooking({
        workerId: workerRowId,
        userId: user?.id,
        bookingId,
        bookingRequestId: entry.bookingRequestId,
        reason: "fcm_ack_timeout",
        extra: {
          source: "fcm_ack_tracker",
          ack_timeout_ms: ACK_TIMEOUT_MS,
          elapsed_ms: Date.now() - entry.startedAt,
        },
      });
    } catch (e) {
      console.warn("[fcmAckTracker] timeout report failed", e);
    }
  }, ACK_TIMEOUT_MS);

  pending.set(bookingId, {
    bookingId,
    bookingRequestId,
    startedAt: Date.now(),
    timer,
  });
}

export function resolveFcmOffer(bookingId: string, _resolution: Resolution) {
  const entry = pending.get(bookingId);
  if (!entry) return;
  clearTimeout(entry.timer);
  pending.delete(bookingId);
}

export function clearFcmOfferTracking() {
  for (const e of pending.values()) clearTimeout(e.timer);
  pending.clear();
}
