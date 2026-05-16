/**
 * Centralized handler for FCM `BOOKING_REASSIGNED` data pushes.
 *
 * When admin reassigns a booking, the previously-assigned worker receives a
 * data-only push with `type=BOOKING_REASSIGNED`. This is NOT a new offer and
 * NOT a cancellation — the worker has simply been removed from the booking
 * because admin is redispatching it.
 *
 * Behavior:
 *  - Do NOT show booking offer overlay/sound.
 *  - Do NOT run the cancellation refund/voice flow.
 *  - Silently clear any active booking-alert overlay if visible.
 *  - Dispatch `bookingReassigned` event so `useActiveJob` clears + refetches.
 *  - Show a single short toast and navigate Home.
 */

import { toast } from 'sonner';
import { dismissAlert } from '@/services/bookingAlertCoordinator';
import { stopAlertOverlay } from '@/lib/alertOverlay';
import { getOverlayBridge } from '@/services/overlay';

let lastHandled: { bookingId: string; at: number } | null = null;

export function handleBookingReassigned(bookingId: string | undefined | null, source: string = 'unknown') {
  if (!bookingId) {
    console.log('[BOOKING_REASSIGNED_RECEIVED] missing bookingId, ignoring');
    return;
  }

  // Dedup within 5s (FCM + native broadcast may both fire)
  const now = Date.now();
  if (lastHandled && lastHandled.bookingId === bookingId && now - lastHandled.at < 5000) {
    return;
  }
  lastHandled = { bookingId, at: now };

  console.log('[BOOKING_REASSIGNED_RECEIVED]', { bookingId, source });

  // Stop any in-flight booking offer for this booking (overlay, sound).
  try { dismissAlert(bookingId); } catch (e) { /* noop */ }
  try { stopAlertOverlay(); } catch (e) { /* noop */ }
  try {
    const bridge = getOverlayBridge();
    bridge.hideOverlay().catch(() => {});
  } catch (e) { /* noop */ }

  // Notify active-job hook to clear + refetch.
  try {
    window.dispatchEvent(
      new CustomEvent('bookingReassigned', { detail: { bookingId, source } })
    );
  } catch (e) {
    console.warn('Failed to dispatch bookingReassigned event', e);
  }

  // User-visible message — single short toast, no popup.
  try {
    toast('This booking has been reassigned by admin.');
  } catch (e) { /* noop */ }
}
