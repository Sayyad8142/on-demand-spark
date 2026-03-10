/**
 * FCM initialization module.
 *
 * Fix 3: All token registration listeners and saveFCMToken logic have been
 * removed from this file to eliminate duplicate writes.
 *
 * Token lifecycle is now:
 *   Native:  MyFirebaseService.onNewToken() → SharedPreferences
 *   JS sync: useFCMTokenSync hook → workers.fcm_token + fcm_tokens table
 *
 * This file retains only foreground notification routing (postMessage for
 * BOOKING_ALERT) and notification-tap handling. Permission + registration
 * are handled by initNativePush() in src/native/push.ts.
 */

import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';

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
  
  // Handle notification received (foreground) — route booking alerts via postMessage
  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('🔔 Foreground notification:', notification);
    const bookingId = notification.data?.bookingId || notification.data?.booking_id;
    
    if (bookingId) {
      console.log('📬 Foreground booking alert:', bookingId);
      window.postMessage({ type: 'BOOKING_ALERT', bookingId }, '*');
    }
  });
  
  // Handle notification clicked — route booking alerts via postMessage
  PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
    console.log('🔔 Notification clicked:', notification);
    const bookingId = notification.notification.data?.bookingId || notification.notification.data?.booking_id;
    
    if (bookingId) {
      console.log('📬 Booking alert clicked:', bookingId);
      window.postMessage({ type: 'BOOKING_ALERT', bookingId }, '*');
    }
  });
  
  fcmInitialized = true;
  console.log('✅ FCM notification handlers initialized');
}

/**
 * @deprecated Token saving is now handled by useFCMTokenSync hook.
 * This function is kept as a no-op for backward compatibility.
 */
export async function saveFCMToken(_userId: string) {
  console.log('ℹ️ saveFCMToken() is deprecated — token sync handled by useFCMTokenSync hook');
}
