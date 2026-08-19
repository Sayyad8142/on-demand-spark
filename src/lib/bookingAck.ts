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
import { Capacitor } from "@capacitor/core";
import { CURRENT_VERSION_NAME } from "@/config/version";


export type AckEvent = "push_received" | "popup_shown" | "worker_seen";

const acked = new Set<string>();
const key = (id: string, ev: AckEvent) => `${id}::${ev}`;
let cachedWorkerId: string | null | undefined;

async function getWorkerId(): Promise<string | null> {
  if (cachedWorkerId !== undefined && cachedWorkerId !== null) return cachedWorkerId;

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    cachedWorkerId = null;
    return null;
  }

  // Worker ID resolution pattern: user_id = uid OR id = uid
  const { data: worker, error: workerError } = await supabase
    .from("workers")
    .select("id")
    .or(`user_id.eq.${user.id},id.eq.${user.id}`)
    .maybeSingle();

  if (workerError || !worker?.id) {
    console.warn("[ACK] worker_id lookup failed", workerError?.message);
    cachedWorkerId = null;
    return null;
  }

  cachedWorkerId = worker.id;
  return cachedWorkerId;
}


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
    const workerId = await getWorkerId();
    if (!workerId) {
      console.warn(`[ACK] ${event} skipped: worker_id unavailable`);
      acked.delete(cacheKey);
      return;
    }

    const { data, error } = await supabase.functions.invoke("ack-booking-delivery", {
      body: {
        booking_id: bookingId,
        booking_request_id: bookingRequestId,
        worker_id: workerId,
        event_type: event,
        app_version: CURRENT_VERSION_NAME,
        device_info: {
          platform: Capacitor.getPlatform(),
          native: Capacitor.isNativePlatform(),
          source: "webview",
        },
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
  cachedWorkerId = undefined;
}
