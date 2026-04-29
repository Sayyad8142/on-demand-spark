import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { syncTokenToBackend } from '@/lib/pushToken';

let lastSyncedToken: string | null = null;

/**
 * initNativePush — Registers the device for push notifications and sets up
 * foreground/tap listeners. 
 *
 * Fix 3: Token persistence is NO LONGER done here. The `registration` listener
 * only logs for debugging. Actual token sync to backend is handled exclusively
 * by useFCMTokenSync (which reads the natively-persisted pending token).
 *
 * This avoids duplicate writes that previously existed across push.ts, fcm.ts,
 * and useFCMTokenSync.
 */
export async function initNativePush(userId?: string) {
  if (!Capacitor.isNativePlatform()) {
    console.log('⏭️ Not native platform, skipping push init');
    return;
  }

  console.log('🔔 initNativePush called for user:', userId);

  let permStatus = await PushNotifications.checkPermissions();
  console.log('📱 Current permission status:', permStatus);
  
  if (permStatus.receive === 'denied') {
    console.warn('⚠️ Booking alerts are disabled. Please enable notifications to receive jobs.');
    return;
  }

  if (permStatus.receive !== 'granted') {
    console.log('🔐 Requesting push permissions...');
    permStatus = await PushNotifications.requestPermissions();
    console.log('📱 Permission result:', permStatus);
  }
  
  if (permStatus.receive !== 'granted') {
    console.warn('⚠️ Push permission not granted');
    return;
  }

  console.log('📝 Registering for push notifications...');
  await PushNotifications.register();

  PushNotifications.addListener('registration', async (token) => {
    console.log('🎯 [push.ts] FCM token received:', token.value.substring(0, 30) + '...');
    if (userId && token.value !== lastSyncedToken) {
      const synced = await syncTokenToBackend(token.value, userId || '', 'native-registration-event');
      if (synced) lastSyncedToken = token.value;
    }
  });

  PushNotifications.addListener('registrationError', (err) => {
    console.error('Registration error:', err);
  });

  // foreground push (debug)
  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('Push received (fg):', notification);
  });

  // tap on notification
  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    console.log('Push action:', action);
  });
}
