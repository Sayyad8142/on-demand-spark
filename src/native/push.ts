import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { ONESIGNAL_APP_ID } from '@/lib/onesignal';

declare global {
  interface Window {
    plugins?: {
      OneSignal?: any;
    };
  }
}

export async function registerNativePush(userId: string) {
  if (!Capacitor.isNativePlatform()) {
    console.log("Not a native platform, skipping native push registration");
    return;
  }

  try {
    const OneSignal = window.plugins?.OneSignal;
    if (!OneSignal) {
      console.error("OneSignal plugin not available");
      return;
    }

    // Initialize OneSignal
    OneSignal.setAppId(ONESIGNAL_APP_ID);

    // Request notification permission
    OneSignal.promptForPushNotificationsWithUserResponse((accepted: boolean) => {
      console.log("Push notification permission:", accepted);
    });

    // Get player ID and save to database
    OneSignal.getDeviceState(async (state: any) => {
      if (state.userId) {
        console.log("OneSignal player ID received:", state.userId.substring(0, 20) + "...");
        try {
          await supabase
            .from('fcm_tokens')
            .upsert({ user_id: userId, token: state.userId });
          console.log("OneSignal player ID saved to database");
        } catch (e) {
          console.error("Error saving player ID:", e);
        }
      }
    });

    // Handle notification opened
    OneSignal.setNotificationOpenedHandler((notification: any) => {
      const bookingId = notification?.notification?.additionalData?.booking_id || 
                       notification?.notification?.additionalData?.bookingId;
      if (bookingId) {
        window.postMessage({ type: 'BOOKING_ALERT', bookingId }, '*');
      }
    });

    // Handle notification received while app is in foreground
    OneSignal.setNotificationWillShowInForegroundHandler((notification: any) => {
      const bookingId = notification?.notification?.additionalData?.booking_id || 
                       notification?.notification?.additionalData?.bookingId;
      if (bookingId) {
        window.postMessage({ type: 'BOOKING_ALERT', bookingId }, '*');
      }
      notification.complete(notification);
    });
  } catch (error) {
    console.error("Error in native push registration:", error);
  }
}
