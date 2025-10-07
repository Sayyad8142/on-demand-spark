import OneSignal from 'onesignal-cordova-plugin';
import { Capacitor } from '@capacitor/core';

// Replace with your actual OneSignal App ID from OneSignal dashboard
// This is a public identifier (not a secret) - safe to hardcode
export const ONESIGNAL_APP_ID = '28bd7e2d-e437-4b45-b454-e276dd2d4e52';

export function initOneSignal(userId?: string) {
  if (!Capacitor.isNativePlatform()) {
    console.log('OneSignal: not native platform, skipping native initialization');
    return;
  }
  
  if (!ONESIGNAL_APP_ID) { 
    console.warn('⚠️ OneSignal APP ID not configured'); 
    return; 
  }

  console.log('🔔 Initializing OneSignal for native platform...');
  
  // Initialize OneSignal with App ID
  OneSignal.initialize(ONESIGNAL_APP_ID);

  // Enable verbose debug logging
  OneSignal.Debug.setLogLevel(6);

  // Request notification permissions FIRST before login
  OneSignal.Notifications.requestPermission(true).then(async (granted) => {
    console.log('🔔 OneSignal permission granted:', granted);
    
    if (granted && userId) {
      // Small delay to ensure SDK is ready
      await new Promise(resolve => setTimeout(resolve, 300));
      
      try {
        console.log('🔗 Logging in OneSignal user:', userId);
        
        // Login to OneSignal - this subscribes the user
        await OneSignal.login(userId);
        
        // Add worker role tag
        OneSignal.User.addTag('role', 'worker');
        
        console.log('✅ OneSignal user logged in and subscribed:', userId);
      } catch (error) {
        console.error('❌ OneSignal login failed:', error);
      }
    } else if (!granted) {
      console.warn('⚠️ OneSignal permission denied - cannot subscribe');
    } else {
      console.warn('⚠️ No userId provided for OneSignal login');
    }
  }).catch((error) => {
    console.error('❌ OneSignal permission request failed:', error);
  });

  // Handle notification clicks (when app is closed/background)
  OneSignal.Notifications.addEventListener('click', (ev: any) => {
    console.log('🔔 OneSignal notification clicked:', ev);
    const additionalData = ev?.notification?.additionalData || {};
    const bookingId = additionalData.bookingId || additionalData.booking_id;
    
    if (bookingId) {
      console.log('📬 Booking alert detected, posting message:', bookingId);
      window.postMessage({ type: 'BOOKING_ALERT', bookingId }, '*');
    }
  });

  // Handle foreground notifications
  OneSignal.Notifications.addEventListener('foregroundWillDisplay', (ev: any) => {
    console.log('🔔 OneSignal foreground notification:', ev);
    const additionalData = ev?.getNotification?.()?.additionalData || {};
    const bookingId = additionalData.bookingId || additionalData.booking_id;
    
    if (bookingId) {
      console.log('📬 Foreground booking alert, posting message:', bookingId);
      window.postMessage({ type: 'BOOKING_ALERT', bookingId }, '*');
    }
  });

  console.log('✅ OneSignal initialization complete');
}
