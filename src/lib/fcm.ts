/**
 * FCM initialization module.
 *
 * Token lifecycle is handled by useFCMTokenSync.
 * This file handles foreground notification routing and notification-tap handling,
 * now routing through the centralized BookingAlertCoordinator for dedup.
 */

import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { processIncomingBooking } from '@/services/bookingAlertCoordinator';
import { logScheduledOfferDecision } from '@/lib/scheduledBookingGuards';
import { parseFcmOffer } from '@/lib/fcmOffer';
import { extractAckToken, rememberAckToken } from '@/lib/bookingAck';
import { fcmOfferDeadline } from '@/lib/fcmOffer';
import { requestOffersResync } from '@/lib/offerFreshness';

let fcmInitialized = false;

export async function initFCM() {
  if (!Capacitor.isNativePlatform()) {
    console.log('FCM: not native platform, skipping');
    return;
  }
  
  if (fcmInitialized) {
    console.log('FCM: already initialized');
    return;
  }
  
  console.log('🔔 Initializing FCM notification handlers...');
  
  // Both receive surfaces use the same absolute-deadline contract.
  const route = async (data: Record<string, unknown>, tapped: boolean) => {
    const bookingId = typeof data.bookingId === 'string' ? data.bookingId
      : typeof data.booking_id === 'string' ? data.booking_id : undefined;
    if (data.type === 'BOOKING_REASSIGNED') {
      const { handleBookingReassigned } = await import('@/lib/bookingReassign');
      handleBookingReassigned(bookingId, tapped ? 'fcm-tap' : 'fcm');
      return;
    }
    if (data.type === 'BOOKING_CANCELLED') {
      if (bookingId) {
        const { dismissAlert } = await import('@/services/bookingAlertCoordinator');
        dismissAlert(bookingId);
        window.dispatchEvent(new CustomEvent('bookingCancelledAlert', {
          detail: { bookingId, source: tapped ? 'fcm-tap' : 'fcm' },
        }));
      }
      return;
    }
    const ackToken = extractAckToken(data) ?? undefined;
    if (!tapped && bookingId && data.type === 'BOOKING_ALERT'
      && String(data.actionable ?? 'true').toLowerCase() !== 'false') {
      const bookingRequestId = typeof data.booking_request_id === 'string' ? data.booking_request_id
        : typeof data.bookingRequestId === 'string' ? data.bookingRequestId : undefined;
      // Record an actual receipt even when expiry must be recovered. A tap,
      // poll or successful acceptance is never substituted for push receipt.
      import('@/lib/bookingAck').then(({ ackBookingDelivery }) =>
        ackBookingDelivery({ bookingId, bookingRequestId, ackToken, event: 'push_received' })
      ).catch(() => {});
    }
    const offer = parseFcmOffer(data);
    if (!offer) {
      if (bookingId && data.type === 'BOOKING_ALERT'
        && String(data.actionable ?? 'true').toLowerCase() !== 'false' && !fcmOfferDeadline(data)) {
        // The single polling reader retrieves the actual server request. Never
        // synthesize an expiry from send time, tap time or the local clock.
        requestOffersResync('fcm_missing_expiry');
      }
      return;
    }
    if (ackToken) rememberAckToken({ ...offer, ackToken });
    logScheduledOfferDecision(offer, 'fcm', true);
    if (!tapped) {
      import('@/lib/fcmAckTracker').then(({ trackFcmOffer }) =>
        trackFcmOffer(offer.bookingId, offer.bookingRequestId)
      ).catch(() => {});
    }
    await processIncomingBooking({ ...offer, ackToken });
  };
  PushNotifications.addListener('pushNotificationReceived', notification =>
    route(notification.data || {}, false));
  PushNotifications.addListener('pushNotificationActionPerformed', notification =>
    route(notification.notification.data || {}, true));

  fcmInitialized = true;
  console.log('✅ FCM notification handlers initialized');
}

/**
 * @deprecated Token saving is now handled by useFCMTokenSync hook.
 */
export async function saveFCMToken(_userId: string) {
  console.log('ℹ️ saveFCMToken() is deprecated — token sync handled by useFCMTokenSync hook');
}
