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
import { canShowWorkerBookingOffer, isBeforeScheduledDispatchWindow, logScheduledOfferDecision } from '@/lib/scheduledBookingGuards';

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
  
  // Handle notification received (foreground) — route through coordinator
  PushNotifications.addListener('pushNotificationReceived', async (notification) => {
    console.log('🔔 Foreground notification:', notification);
    const data = notification.data || {};
    const bookingId = data.bookingId || data.booking_id;
    const bookingRequestId = data.booking_request_id || data.bookingRequestId;

    // Short-circuit: admin reassignment — not a new offer.
    if (data.type === 'BOOKING_REASSIGNED') {
      const { handleBookingReassigned } = await import('@/lib/bookingReassign');
      handleBookingReassigned(bookingId, 'fcm');
      return;
    }

    if (bookingId) {
      const scheduleInfo = {
        bookingId,
        bookingType: data.booking_type || data.bookingType,
        scheduledDate: data.scheduled_date || data.scheduledDate,
        scheduledTime: data.scheduled_time || data.scheduledTime,
        prealertSent: data.prealert_sent === true || data.prealert_sent === 'true' || data.prealertSent === true || data.prealertSent === 'true',
      };
      if (!canShowWorkerBookingOffer(scheduleInfo)) {
        logScheduledOfferDecision(scheduleInfo, 'fcm', false);
        console.log('🔕 FCM scheduled booking ignored until prealert_sent=true:', bookingId);
        return;
      }
      if (!bookingRequestId && isBeforeScheduledDispatchWindow(scheduleInfo)) {
        logScheduledOfferDecision(scheduleInfo, 'fcm', false);
        console.log('🔕 FCM scheduled booking ignored before dispatch window:', bookingId);
        return;
      }

      console.log('📬 Foreground booking alert via FCM:', bookingId);

      // ACK the FCM delivery immediately (fire-and-forget)
      import('@/lib/bookingAck').then(({ ackBookingDelivery }) =>
        ackBookingDelivery({ bookingId, bookingRequestId, event: 'push_received' })
      ).catch(() => {});

      // Start FCM ack timeout tracker — if popup never shows, report missed
      import('@/lib/fcmAckTracker').then(({ trackFcmOffer }) =>
        trackFcmOffer(bookingId, bookingRequestId)
      ).catch(() => {});

      await processIncomingBooking({
        bookingId,
        bookingRequestId,
        custName: data.cust_name || data.custName || 'Customer',
        community: data.community || '',
        serviceType: data.service_type || data.serviceType || '',
        flatNo: data.flat_no || data.flatNo || '',
        priceInr: parseInt(data.price_inr || data.priceInr || '0', 10),
        bookingType: scheduleInfo.bookingType,
        scheduledDate: scheduleInfo.scheduledDate,
        scheduledTime: scheduleInfo.scheduledTime,
        prealertSent: scheduleInfo.prealertSent,
        source: 'fcm',
      });
    }
  });
  
  // Handle notification clicked — route through coordinator
  PushNotifications.addListener('pushNotificationActionPerformed', async (notification) => {
    console.log('🔔 Notification clicked:', notification);
    const data = notification.notification.data || {};
    const bookingId = data.bookingId || data.booking_id;
    const bookingRequestId = data.booking_request_id || data.bookingRequestId;

    if (data.type === 'BOOKING_REASSIGNED') {
      const { handleBookingReassigned } = await import('@/lib/bookingReassign');
      handleBookingReassigned(bookingId, 'fcm-tap');
      return;
    }

    if (bookingId) {
      const scheduleInfo = {
        bookingId,
        bookingType: data.booking_type || data.bookingType,
        scheduledDate: data.scheduled_date || data.scheduledDate,
        scheduledTime: data.scheduled_time || data.scheduledTime,
        prealertSent: data.prealert_sent === true || data.prealert_sent === 'true' || data.prealertSent === true || data.prealertSent === 'true',
      };
      if (!canShowWorkerBookingOffer(scheduleInfo)) {
        logScheduledOfferDecision(scheduleInfo, 'fcm', false);
        console.log('🔕 FCM scheduled booking tap ignored until prealert_sent=true:', bookingId);
        return;
      }
      if (!bookingRequestId && isBeforeScheduledDispatchWindow(scheduleInfo)) {
        logScheduledOfferDecision(scheduleInfo, 'fcm', false);
        console.log('🔕 FCM scheduled booking tap ignored before dispatch window:', bookingId);
        return;
      }

      console.log('📬 Booking alert clicked:', bookingId);
      await processIncomingBooking({
        bookingId,
        bookingRequestId,
        custName: data.cust_name || data.custName || 'Customer',
        community: data.community || '',
        serviceType: data.service_type || data.serviceType || '',
        flatNo: data.flat_no || data.flatNo || '',
        priceInr: parseInt(data.price_inr || data.priceInr || '0', 10),
        bookingType: scheduleInfo.bookingType,
        scheduledDate: scheduleInfo.scheduledDate,
        scheduledTime: scheduleInfo.scheduledTime,
        prealertSent: scheduleInfo.prealertSent,
        source: 'fcm',
      });
    }
  });
  
  fcmInitialized = true;
  console.log('✅ FCM notification handlers initialized');
}

/**
 * @deprecated Token saving is now handled by useFCMTokenSync hook.
 */
export async function saveFCMToken(_userId: string) {
  console.log('ℹ️ saveFCMToken() is deprecated — token sync handled by useFCMTokenSync hook');
}
