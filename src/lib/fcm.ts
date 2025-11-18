import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { requestNotificationPermissionWithRationale } from '@/native/permission';

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
  
  console.log('🔔 Initializing FCM...');
  
  // Request permission with rationale dialog
  await requestNotificationPermissionWithRationale();
  
  // Wait a moment and check permission status
  await new Promise(resolve => setTimeout(resolve, 1000));
  const permStatus = await PushNotifications.checkPermissions();
  
  if (permStatus.receive !== 'granted') {
    console.warn('⚠️ Push notification permission not granted');
    return;
  }
  
  // Register with FCM
  await PushNotifications.register();
  
  // Handle registration success
  PushNotifications.addListener('registration', async (token) => {
    console.log('✅ FCM token received:', token.value.substring(0, 20) + '...');
  });
  
  // Handle registration error
  PushNotifications.addListener('registrationError', (error) => {
    console.error('❌ FCM registration error:', error);
  });
  
  // Handle notification received (foreground)
  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('🔔 Foreground notification:', notification);
    const bookingId = notification.data?.bookingId || notification.data?.booking_id;
    const notifType = notification.data?.type;
    
    if (notifType === 'incoming_rtc') {
      const rtcCallId = notification.data?.rtc_call_id;
      const callerName = notification.data?.caller_name;
      console.log('📞 Incoming call:', rtcCallId, 'from:', callerName);
      window.postMessage({ type: 'INCOMING_RTC_CALL', rtcCallId, callerName }, '*');
    } else if (bookingId) {
      console.log('📬 Foreground booking alert:', bookingId);
      window.postMessage({ type: 'BOOKING_ALERT', bookingId }, '*');
    }
  });
  
  // Handle notification clicked
  PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
    console.log('🔔 Notification clicked:', notification);
    const bookingId = notification.notification.data?.bookingId || notification.notification.data?.booking_id;
    const notifType = notification.notification.data?.type;
    
    if (notifType === 'incoming_rtc') {
      const rtcCallId = notification.notification.data?.rtc_call_id;
      const callerName = notification.notification.data?.caller_name;
      console.log('📞 Incoming call clicked:', rtcCallId, 'from:', callerName);
      window.postMessage({ type: 'INCOMING_RTC_CALL', rtcCallId, callerName }, '*');
    } else if (bookingId) {
      console.log('📬 Booking alert clicked:', bookingId);
      window.postMessage({ type: 'BOOKING_ALERT', bookingId }, '*');
    }
  });
  
  fcmInitialized = true;
  console.log('✅ FCM initialized');
}

export async function saveFCMToken(userId: string) {
  if (!Capacitor.isNativePlatform()) {
    console.log('FCM: not native platform, skipping token save');
    return;
  }
  
  try {
    // Get delivered notifications to ensure we have permission
    const delivered = await PushNotifications.getDeliveredNotifications();
    console.log('📱 Delivered notifications count:', delivered.notifications.length);
    
    // The token is received via the 'registration' listener
    // We need to store it when received
    PushNotifications.addListener('registration', async (token) => {
      console.log('💾 Saving FCM token for user:', userId);
      
      const { error } = await supabase
        .from('fcm_tokens')
        .upsert({ 
          user_id: userId, 
          token: token.value 
        });
      
      if (error) {
        console.error('❌ Error saving FCM token:', error);
      } else {
        console.log('✅ FCM token saved to database');
      }
    });
  } catch (error) {
    console.error('❌ FCM token save error:', error);
  }
}
