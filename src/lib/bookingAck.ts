/**
 * Booking delivery ACK helper.
 *
 * Fire-and-forget calls to the `ack-booking-delivery` edge function so the
 * server can record exactly when each alert reached the worker:
 *
 *   - push_received: the FCM data payload arrived on this device
 *   - popup_shown:   the booking popup actually rendered on screen
 *   - worker_seen:   the worker visibly opened/saw the booking card
 *
 * Idempotent on both sides: the server only writes the timestamp the first
 * time, and we cache acked (booking_id + event) pairs in memory to avoid
 * spamming the network.
 */

import { supabase } from "@/integrations/supabase/client";

export type AckEvent = "push_received" | "popup_shown" | "worker_seen";

const acked = new Set<string>();
const key = (id: string, ev: AckEvent) => `${id}::${ev}`;

interface AckArgs {
  bookingId?: string;
  bookingRequestId?: string;
  event: AckEvent;
}

export async function ackBookingDelivery({ bookingId, bookingRequestId, event }: AckArgs): Promise<void> {
  const cacheKey = key(bookingRequestId ?? bookingId ?? "?", event);
  if (acked.has(cacheKey)) return;
  acked.add(cacheKey);

  if (!bookingId && !bookingRequestId) return;

  try {
    const { data, error } = await supabase.functions.invoke("ack-booking-delivery", {
      body: {
        booking_id: bookingId,
        booking_request_id: bookingRequestId,
        event_type: event,
      },
    });
    if (error) {
      console.warn(`[ACK] ${event} failed`, error.message);
      // allow retry next time
      acked.delete(cacheKey);
      return;
    }
    console.log(`[ACK] ${event} ok`, data);
  } catch (e) {
    console.warn(`[ACK] ${event} threw`, e);
    acked.delete(cacheKey);
  }
}

/** Reset the in-memory cache (e.g. on logout or test) */
export function resetAckCache() {
  acked.clear();
}
