import { PushService } from './PushService';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from '@/integrations/supabase/client';

/**
 * Native Push Service for Capacitor/Android
 * This implementation uses Capacitor's Push Notifications plugin
 */
export class NativePushService implements PushService {
  isSupported(): boolean {
    return true; // Native always supports push
  }

  async requestPermission(): Promise<boolean> {
    try {
      const result = await PushNotifications.requestPermissions();
      return result.receive === 'granted';
    } catch (error) {
      console.error('❌ Error requesting push permission:', error);
      return false;
    }
  }

  async getToken(): Promise<string | null> {
    try {
      await PushNotifications.register();
      
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Token registration timeout'));
        }, 10000);

        PushNotifications.addListener('registration', (token) => {
          clearTimeout(timeout);
          resolve(token.value);
        });

        PushNotifications.addListener('registrationError', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    } catch (error) {
      console.error('❌ Error getting push token:', error);
      return null;
    }
  }

  async registerToken(token: string, userId: string): Promise<void> {
    try {
      // Primary: workers.fcm_token with health tracking
      await supabase.from('workers').update({
        fcm_token: token,
        fcm_token_status: 'active',
        fcm_token_updated_at: new Date().toISOString(),
        fcm_token_platform: 'android',
        updated_at: new Date().toISOString(),
      }).eq('user_id', userId);

      // Fallback: fcm_tokens table (legacy)
      const { error } = await supabase.from('fcm_tokens').upsert({
        user_id: userId,
        token: token,
        updated_at: new Date().toISOString(),
      });

      if (error) console.warn('⚠️ fcm_tokens fallback write failed:', error);
      console.log('✅ Native push token registered with health tracking');
    } catch (error) {
      console.error('❌ Error registering push token:', error);
      throw error;
    }
  }

  onMessage(handler: (payload: any) => void): () => void {
    PushNotifications.addListener('pushNotificationReceived', handler);
    
    return () => {
      PushNotifications.removeAllListeners();
    };
  }
}
