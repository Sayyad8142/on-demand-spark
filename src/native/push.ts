import { PushNotifications, Token, ActionPerformed } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';

export async function registerNativePush(userId: string) {
  if (!Capacitor.isNativePlatform()) {
    console.log("Not a native platform, skipping native push registration");
    return;
  }

  try {
    // Request permission
    let permStatus = await PushNotifications.checkPermissions();
    if (permStatus.receive !== 'granted') {
      permStatus = await PushNotifications.requestPermissions();
      if (permStatus.receive !== 'granted') {
        console.log("Push notification permission not granted");
        return;
      }
    }

    // Register for push notifications
    await PushNotifications.register();
    console.log("Native push registration initiated");

    // Handle token registration
    PushNotifications.addListener('registration', async (token: Token) => {
      console.log("Native push token received:", token.value.substring(0, 20) + "...");
      try {
        await supabase
          .from('fcm_tokens')
          .upsert({ user_id: userId, token: token.value })
          .throwOnError();
        console.log("Native push token saved to database");
      } catch (e) {
        console.error("Error saving native push token:", e);
      }
    });

    // Handle registration errors
    PushNotifications.addListener('registrationError', (error) => {
      console.error("Native push registration error:", error);
    });

    // Handle foreground notifications
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log("Foreground notification received:", notification);
      const bookingId = notification?.data?.bookingId || notification?.data?.booking_id;
      if (bookingId) {
        window.postMessage({ type: 'BOOKING_ALERT', bookingId }, '*');
      }
    });

    // Handle notification tap
    PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
      console.log("Notification tapped:", action);
      const bookingId = action?.notification?.data?.bookingId || action?.notification?.data?.booking_id;
      if (bookingId) {
        window.postMessage({ type: 'BOOKING_ALERT', bookingId }, '*');
      }
    });
  } catch (error) {
    console.error("Error in native push registration:", error);
  }
}
