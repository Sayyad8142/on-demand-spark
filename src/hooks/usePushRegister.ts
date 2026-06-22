import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getPushService } from '@/services/push';
import { syncTokenToBackend } from '@/lib/pushToken';

export function usePushRegister() {
  const [registeredToken, setRegisteredToken] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  const registerPush = async (): Promise<string> => {
    setIsRegistering(true);

    try {
      const pushService = getPushService();

      if (!pushService.isSupported()) {
        throw new Error('Push notifications not supported on this platform');
      }

      console.log('📱 Requesting push notification permission...');
      const hasPermission = await pushService.requestPermission();
      if (!hasPermission) {
        throw new Error('Push notification permission denied');
      }

      console.log('✅ Permission granted, getting token...');
      const token = await pushService.getToken();
      if (!token) {
        throw new Error('Failed to get push token');
      }

      console.log('✅ Token received:', token.substring(0, 20) + '...');

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('No authenticated user');
      }

      // Single source of truth: delegate ALL token writes to syncTokenToBackend.
      // This resets fcm_token_status='active', no_ack_count=0,
      // notification_repair_failures=0, last_app_opened_at, app_version, etc.
      const synced = await syncTokenToBackend(token, user.id, 'usePushRegister');
      if (!synced) {
        throw new Error('Failed to sync token to backend');
      }

      console.log('✅ Token registered via syncTokenToBackend (single writer)');

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
