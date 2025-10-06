import OneSignal from 'onesignal-cordova-plugin';
import { Capacitor } from '@capacitor/core';

// Replace with your actual OneSignal App ID from OneSignal dashboard
// This is a public identifier (not a secret) - safe to hardcode
export const ONESIGNAL_APP_ID = '28bd7e2d-e437-4b45-b454-e276dd2d4e52';

export function initOneSignal(userId?: string) {
  if (!Capacitor.isNativePlatform()) {
    console.log('OneSignal: not native, skipping');
    return;
  }
  
  if (!ONESIGNAL_APP_ID) { 
    console.warn('OneSignal APP ID not configured'); 
    return; 
  }

  // Initialize OneSignal with App ID
  OneSignal.initialize(ONESIGNAL_APP_ID);

  // Enable debug logging
  OneSignal.Debug.setLogLevel(6);

  if (userId) {
    OneSignal.login(userId);        // ties device to the Supabase user id
    OneSignal.User.addTag('role', 'worker');
  }

  OneSignal.Notifications.requestPermission(true).then((granted) => {
    console.log('OneSignal permission:', granted);
  });

  OneSignal.Notifications.addEventListener('click', (ev: any) => {
    const additionalData = ev?.notification?.additionalData || {};
    const bookingId = additionalData.bookingId || additionalData.booking_id;
    if (bookingId) {
      window.postMessage({ type: 'BOOKING_ALERT', bookingId }, '*');
    }
  });

  OneSignal.Notifications.addEventListener('foregroundWillDisplay', (ev: any) => {
    // Display the notification in foreground
    const additionalData = ev?.getNotification?.()?.additionalData || {};
    const bookingId = additionalData.bookingId || additionalData.booking_id;
    if (bookingId) {
      window.postMessage({ type: 'BOOKING_ALERT', bookingId }, '*');
    }
  });

  console.log('OneSignal initialized');
}
