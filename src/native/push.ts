import { PushNotifications, Token, ActionPerformed } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';

export async function registerNativePush(userId: string) {
  if (!Capacitor.isNativePlatform()) return; // only in APK

  // request permission
  let permStatus = await PushNotifications.checkPermissions();
  if (permStatus.receive !== 'granted') {
    permStatus = await PushNotifications.requestPermissions();
    if (permStatus.receive !== 'granted') return;
  }

  // init + register
  await PushNotifications.register();

  // get token
  PushNotifications.addListener('registration', async (token: Token) => {
    try {
      await supabase.from('fcm_tokens')
        .upsert({ user_id: userId, token: token.value })
        .throwOnError();
    } catch (e) {
      // no-op
    }
  });

  // registration error
  PushNotifications.addListener('registrationError', (_err) => {
    // no-op
  });

  // app received a push in foreground
  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    const bookingId = notification?.data?.bookingId;
    if (bookingId) {
      window.postMessage({ type: 'BOOKING_ALERT', bookingId }, '*');
    }
  });

  // user tapped a notification
  PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
    const bookingId = action?.notification?.data?.bookingId;
    if (bookingId) {
      window.postMessage({ type: 'BOOKING_ALERT', bookingId }, '*');
    }
  });
}
