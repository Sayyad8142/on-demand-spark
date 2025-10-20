import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { getPushService } from '@/services/push';

export function usePushRegister() {
  const [registeredToken, setRegisteredToken] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  const registerPush = async (): Promise<string> => {
    setIsRegistering(true);

    try {
      const pushService = getPushService();

      // Check if push is supported
      if (!pushService.isSupported()) {
        throw new Error('Push notifications not supported on this platform');
      }

      console.log('📱 Requesting push notification permission...');
      
      // Request permissions safely
      const hasPermission = await pushService.requestPermission();
      
      if (!hasPermission) {
        throw new Error('Push notification permission denied');
      }

      console.log('✅ Permission granted, getting token...');

      // Get push token
      const token = await pushService.getToken();
      
      if (!token) {
        throw new Error('Failed to get push token');
      }

      console.log('✅ Token received:', token.substring(0, 20) + '...');

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('No authenticated user');
      }

      console.log('💾 Saving token to database...');

      // Register token with backend (saves to fcm_tokens table)
      await pushService.registerToken(token, user.id);

      // Also save to workers table
      const { error: workerError } = await supabase
        .from('workers')
        .update({
          fcm_token: token,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);

      if (workerError) {
        console.error('❌ Failed to save token to workers table:', workerError);
        throw new Error('Failed to save token to workers table');
      }

      console.log('✅ Token registered successfully in both tables');

      setRegisteredToken(token);
      setLastSyncTime(new Date());
      return token;

    } catch (error) {
      console.error('❌ Push registration error:', error);
      throw error;
    } finally {
      setIsRegistering(false);
    }
  };

  const checkRegistrationStatus = async (): Promise<{
    isRegistered: boolean;
    token: string | null;
  }> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return { isRegistered: false, token: null };
      }

      // Check workers table first (primary source)
      const { data: workerData, error: workerError } = await supabase
        .from('workers')
        .select('fcm_token, updated_at')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!workerError && workerData?.fcm_token) {
        setRegisteredToken(workerData.fcm_token);
        setLastSyncTime(new Date(workerData.updated_at));
        return { isRegistered: true, token: workerData.fcm_token };
      }

      // Fallback to fcm_tokens table
      const { data, error } = await supabase
        .from('fcm_tokens')
        .select('token, updated_at')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error || !data) {
        return { isRegistered: false, token: null };
      }

      setRegisteredToken(data.token);
      setLastSyncTime(new Date(data.updated_at));
      return { isRegistered: true, token: data.token };
    } catch (error) {
      console.error('Error checking registration status:', error);
      return { isRegistered: false, token: null };
    }
  };

  return {
    registerPush,
    checkRegistrationStatus,
    registeredToken,
    isRegistering,
    lastSyncTime,
  };
}
