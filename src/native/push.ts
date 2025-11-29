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
  console.log('📱 Platform:', Capacitor.getPlatform());
  console.log('📱 Is native?', Capacitor.isNativePlatform());
  
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
  console.log('📱 Current permission status:', JSON.stringify(permStatus));
  
  if (permStatus.receive !== 'granted') {
    console.log('🔐 Requesting push permissions...');
    permStatus = await PushNotifications.requestPermissions();
    console.log('📱 Permission result:', JSON.stringify(permStatus));
  }
  
  if (permStatus.receive !== 'granted') {
    console.warn('⚠️ Push permission not granted:', JSON.stringify(permStatus));
    return;
  }

  console.log('📝 Registering for push notifications...');
  try {
    await PushNotifications.register();
    console.log('✅ Push registration initiated');
  } catch (error) {
    console.error('❌ Push registration failed:', error);
    throw error;
  }

  PushNotifications.addListener('registration', async (token) => {
    console.log('🎯 FCM token received (full):', token.value);
    console.log('🎯 Token length:', token.value.length);
    
    try {
      // Store token in local storage for future use
      await capacitorStorage.setItem(FCM_TOKEN_KEY, token.value);
      console.log('💾 Token stored in local storage');
      
      // Verify it was stored
      const verifyToken = await capacitorStorage.getItem(FCM_TOKEN_KEY);
      console.log('✅ Token verification:', verifyToken ? 'Found' : 'NOT FOUND');
      
      if (!userId) {
        console.error('❌ No userId provided, cannot save token to database');
        console.error('❌ Make sure user is logged in before push registration');
        return;
      }
      
      console.log('💾 Attempting to save token to database for user:', userId);
      await saveTokenToDatabase(userId, token.value);
      console.log('✅ Token save to database completed');
    } catch (e) {
      console.error('❌ Exception saving FCM token:', e);
      console.error('❌ Error details:', JSON.stringify(e));
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
  console.log('💾 Token to save:', token.substring(0, 50) + '...');
  
  try {
    // Save to fcm_tokens table (legacy)
    console.log('💾 Upserting to fcm_tokens table...');
    const { data: fcmData, error: fcmError } = await supabase.from('fcm_tokens').upsert(
      { user_id: userId, token: token },
      { onConflict: 'user_id' }
    );
    
    if (fcmError) {
      console.error('❌ Failed to save FCM token to fcm_tokens:', JSON.stringify(fcmError));
      throw fcmError;
    } else {
      console.log('✅ FCM token saved to fcm_tokens table');
    }

    // Save to workers table
    console.log('💾 Updating workers table...');
    const { data: workerData, error: workerError } = await supabase
      .from('workers')
      .update({
        fcm_token: token,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (workerError) {
      console.error('❌ Failed to save FCM token to workers:', JSON.stringify(workerError));
      throw workerError;
    } else {
      console.log('✅ FCM token saved to workers table');
    }
    
    // Verify the token was saved
    console.log('🔍 Verifying token was saved...');
    const { data: verifyData, error: verifyError } = await supabase
      .from('fcm_tokens')
      .select('token')
      .eq('user_id', userId)
      .maybeSingle();
    
    if (verifyError) {
      console.error('❌ Verification failed:', JSON.stringify(verifyError));
    } else if (verifyData?.token === token) {
      console.log('✅✅ Token verified in database!');
    } else {
      console.error('❌ Token verification mismatch!');
    }
  } catch (error) {
    console.error('❌ Exception in saveTokenToDatabase:', error);
    throw error;
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
