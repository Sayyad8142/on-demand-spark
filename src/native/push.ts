import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { capacitorStorage } from '@/lib/capacitorStorage';

const FCM_TOKEN_KEY = 'fcm_device_token';

export async function initNativePush(userId?: string) {
  if (!Capacitor.isNativePlatform()) {
    console.log('⏭️ Not native platform, skipping push init');
    return;
  }

  console.log('🔔 initNativePush called for user:', userId);
  
  // Check if we have a stored device token from previous sessions
  if (userId) {
    try {
      const storedToken = await capacitorStorage.getItem(FCM_TOKEN_KEY);
      if (storedToken) {
        console.log('📱 Found stored device token, assigning to current user...');
        await saveTokenToDatabase(userId, storedToken);
      }
    } catch (e) {
      console.error('❌ Error checking stored token:', e);
    }
  }
  
  // Check if existing token is recent (< 7 days old)
  if (userId) {
    try {
      const { data: tokenData } = await supabase
        .from('fcm_tokens')
        .select('updated_at')
        .eq('user_id', userId)
        .maybeSingle();
      
      if (tokenData) {
        const tokenAge = Date.now() - new Date(tokenData.updated_at).getTime();
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        
        if (tokenAge > sevenDays) {
          console.log('⚠️ FCM token is older than 7 days, forcing refresh...');
          // Delete old token to force fresh registration
          await supabase
            .from('fcm_tokens')
            .delete()
            .eq('user_id', userId);
        } else {
          console.log('✅ FCM token is recent (age: ' + Math.floor(tokenAge / (24 * 60 * 60 * 1000)) + ' days)');
        }
      }
    } catch (e) {
      console.error('❌ Error checking token age:', e);
    }
  }

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
      // Store token in local storage for future use
      await capacitorStorage.setItem(FCM_TOKEN_KEY, token.value);
      console.log('💾 Token stored in local storage');
      
      if (!userId) {
        console.error('❌ No userId provided, cannot save token to database');
        return;
      }
      
      await saveTokenToDatabase(userId, token.value);
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

// Helper function to save token to database
async function saveTokenToDatabase(userId: string, token: string) {
  console.log('💾 Saving FCM token for user:', userId);
  
  // Save to fcm_tokens table (legacy)
  const { error: fcmError } = await supabase.from('fcm_tokens').upsert(
    { user_id: userId, token: token },
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
      fcm_token: token,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (workerError) {
    console.error('❌ Failed to save FCM token to workers:', workerError);
  } else {
    console.log('✅ FCM token saved to workers table');
  }
}

// Function to clear FCM token from database (called on logout)
export async function clearFCMToken(userId: string) {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  console.log('🗑️ Clearing FCM token for user:', userId);

  try {
    // Remove from fcm_tokens table
    await supabase.from('fcm_tokens').delete().eq('user_id', userId);
    
    // Remove from workers table
    await supabase
      .from('workers')
      .update({ fcm_token: null })
      .eq('user_id', userId);
    
    console.log('✅ FCM token cleared from database');
  } catch (e) {
    console.error('❌ Error clearing FCM token:', e);
  }
}
