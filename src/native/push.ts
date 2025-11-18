import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { requestNotificationPermissionWithRationale } from './permission';

export async function initNativePush(userId?: string) {
  if (!Capacitor.isNativePlatform()) {
    console.log('⏭️ Not native platform, skipping push init');
    return;
  }

  console.log('🔔 initNativePush called for user:', userId);

  let permStatus = await PushNotifications.checkPermissions();
  console.log('📱 Current permission status:', permStatus);
  
  if (permStatus.receive !== 'granted') {
    console.log('🔐 Requesting push permissions with rationale...');
    // Show rationale dialog before requesting permission
    await requestNotificationPermissionWithRationale();
    // Wait a moment for the permission request to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
    permStatus = await PushNotifications.checkPermissions();
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
      
      // Save to fcm_tokens table (legacy)
      const { error: fcmError } = await supabase.from('fcm_tokens').upsert(
        { user_id: userId, token: token.value },
        { onConflict: 'user_id' }
      );
      
      if (fcmError) {
        console.error('❌ Failed to save FCM token to fcm_tokens:', fcmError);
      } else {
        console.log('✅ FCM token saved to fcm_tokens table');
      }

      // Save to workers table
      const { error: workerError } = await supabase
        .from('workers')
        .update({
          fcm_token: token.value,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      if (workerError) {
        console.error('❌ Failed to save FCM token to workers:', workerError);
      } else {
        console.log('✅ FCM token saved to workers table');
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
