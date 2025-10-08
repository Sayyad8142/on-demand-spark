import OneSignal from 'onesignal-cordova-plugin';
import { Capacitor } from '@capacitor/core';

export const ONESIGNAL_APP_ID = '28bd7e2d-e437-4b45-b454-e276dd2d4e52';

let osInitialized = false;

export function initOneSignal() {
  if (!Capacitor.isNativePlatform()) {
    console.log('OneSignal: not native platform, skipping');
    return;
  }
  
  if (osInitialized) {
    console.log('OneSignal: already initialized');
    return;
  }
  
  if (!ONESIGNAL_APP_ID) { 
    console.warn('⚠️ OneSignal APP ID not configured'); 
    return; 
  }

  console.log('🔔 Initializing OneSignal...');
  
  OneSignal.initialize(ONESIGNAL_APP_ID);
  OneSignal.Debug.setLogLevel(6);
  
  // Request notification permission
  OneSignal.Notifications.requestPermission(true);
  
  // Handle notification clicks
  OneSignal.Notifications.addEventListener('click', (ev: any) => {
    console.log('🔔 Notification clicked:', ev);
    const additionalData = ev?.notification?.additionalData || {};
    const bookingId = additionalData.bookingId || additionalData.booking_id;
    
    if (bookingId) {
      console.log('📬 Booking alert clicked:', bookingId);
      window.postMessage({ type: 'BOOKING_ALERT', bookingId }, '*');
    }
  });

  // Handle foreground notifications
  OneSignal.Notifications.addEventListener('foregroundWillDisplay', (ev: any) => {
    console.log('🔔 Foreground notification:', ev);
    const additionalData = ev?.getNotification?.()?.additionalData || {};
    const bookingId = additionalData.bookingId || additionalData.booking_id;
    
    if (bookingId) {
      console.log('📬 Foreground booking alert:', bookingId);
      window.postMessage({ type: 'BOOKING_ALERT', bookingId }, '*');
    }
  });

  osInitialized = true;
  console.log('✅ OneSignal initialized');
}

export async function loginOneSignal(userId: string) {
  if (!Capacitor.isNativePlatform()) {
    console.log('OneSignal: not native platform, skipping login');
    return;
  }
  
  try {
    console.log('🔗 Logging in OneSignal user:', userId);
    await OneSignal.login(userId);
    await OneSignal.User.addTag('role', 'worker');
    console.log('✅ OneSignal user logged in:', userId);
  } catch (error) {
    console.error('❌ OneSignal login error:', error);
  }
}
