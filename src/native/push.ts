import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';

export async function initNativePush(userId?: string) {
  if (!Capacitor.isNativePlatform()) {
    console.log('⏭️ Not native platform, skipping push init');
    return;
  }

  console.log('🔔 initNativePush called for user:', userId);

  let permStatus = await PushNotifications.checkPermissions();
  console.log('📱 Current permission status:', permStatus);
  
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
    console.log('🎯 FCM token received:', token.value.substring(0, 30) + '...');
    
    try {
      if (!userId) {
        console.error('❌ No userId provided, cannot save token');
        return;
      }
      
      console.log('💾 Saving FCM token for user:', userId);
      const { data, error } = await supabase.from('fcm_tokens').upsert(
        { user_id: userId, token: token.value },
        { onConflict: 'user_id' }
      );
      
      if (error) {
        console.error('❌ Failed to save FCM token:', error);
      } else {
        console.log('✅ FCM token saved successfully to database');
      }
    } catch (e) {
      console.error('❌ Exception saving FCM token:', e);
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
