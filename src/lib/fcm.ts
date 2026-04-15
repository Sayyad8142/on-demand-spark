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
    
    if (bookingId) {
      console.log('📬 Foreground booking alert via FCM:', bookingId);
      await processIncomingBooking({
        bookingId,
        custName: data.cust_name || data.custName || 'Customer',
        community: data.community || '',
        serviceType: data.service_type || data.serviceType || '',
        flatNo: data.flat_no || data.flatNo || '',
        priceInr: parseInt(data.price_inr || data.priceInr || '0', 10),
        source: 'fcm',
      });
    }
  });
  
  // Handle notification clicked — route through coordinator
  PushNotifications.addListener('pushNotificationActionPerformed', async (notification) => {
    console.log('🔔 Notification clicked:', notification);
    const data = notification.notification.data || {};
    const bookingId = data.bookingId || data.booking_id;
    
    if (bookingId) {
      console.log('📬 Booking alert clicked:', bookingId);
      await processIncomingBooking({
        bookingId,
        custName: data.cust_name || data.custName || 'Customer',
        community: data.community || '',
        serviceType: data.service_type || data.serviceType || '',
        flatNo: data.flat_no || data.flatNo || '',
        priceInr: parseInt(data.price_inr || data.priceInr || '0', 10),
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
