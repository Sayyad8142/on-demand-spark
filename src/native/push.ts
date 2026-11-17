import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { syncTokenToBackend } from '@/lib/pushToken';

let lastSyncedToken: string | null = null;
let listenersInitialized = false;
let activeUserId: string | undefined;

/**
 * initNativePush — Registers the device for push notifications and sets up
 * foreground/tap listeners.
 *
 * Listeners are attached before registration, even while permission is denied.
 * Registration/rotation uses the shared session-verified token writer;
 * the background native service and resume sync cover a sleeping WebView.
 */
export async function initNativePush(userId?: string) {
  if (activeUserId !== userId) lastSyncedToken = null;
  activeUserId = userId;

  if (!Capacitor.isNativePlatform()) {
    console.log('⏭️ Not native platform, skipping push init');
    return;
  }

  console.log('🔔 initNativePush called for user:', userId);

  if (!listenersInitialized) {
    listenersInitialized = true;

    await PushNotifications.addListener('registration', async (token) => {
      console.log('🎯 [push.ts] FCM token received (len=' + token.value.length + ')');
      if (activeUserId && token.value !== lastSyncedToken) {
        const synced = await syncTokenToBackend(token.value, activeUserId, 'native-registration-event');
        if (synced) lastSyncedToken = token.value;
      }
    });

    await PushNotifications.addListener('registrationError', (err) => {
      console.error('Registration error:', err);
    });

    await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('Push received (fg):', notification.data?.type ?? 'unknown');
      const data = notification.data || {};
      if (data.type === 'BOOKING_CANCELLED') {
        window.dispatchEvent(new CustomEvent('bookingCancelledAlert', {
          detail: { bookingId: data.bookingId || data.booking_id, source: 'capacitor-push' },
        }));
      } else if (data.type === 'BOOKING_REASSIGNED') {
        import('@/lib/bookingReassign').then(({ handleBookingReassigned }) =>
          handleBookingReassigned(data.bookingId || data.booking_id, 'capacitor-push')
        );
      }
    });

    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('Push action:', action.actionId);
    });
  }
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

  await PushNotifications.register();
}
