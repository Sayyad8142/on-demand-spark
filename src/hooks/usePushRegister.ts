import { useState } from 'react';
import { PushNotifications, Token } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';

export function usePushRegister() {
  const [registeredToken, setRegisteredToken] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);

  const registerPush = async (): Promise<string> => {
    if (!Capacitor.isNativePlatform()) {
      throw new Error('Push notifications only available on native platforms');
    }

    setIsRegistering(true);

    try {
      // Request permissions
      const permStatus = await PushNotifications.requestPermissions();
      
      if (permStatus.receive !== 'granted') {
        throw new Error('Push notification permission denied');
      }

      // Register for push
      await PushNotifications.register();

      // Wait for registration token
      const token = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Registration timeout'));
        }, 10000);

        PushNotifications.addListener('registration', (token: Token) => {
          clearTimeout(timeout);
          resolve(token.value);
        });

        PushNotifications.addListener('registrationError', (error: any) => {
          clearTimeout(timeout);
          reject(new Error(error.error || 'Registration failed'));
        });
      });

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('No authenticated user');
      }

      // Save token to Supabase
      const { error } = await supabase
        .from('fcm_tokens')
        .upsert({
          user_id: user.id,
          token: token,
          platform: 'android'
        });

      if (error) {
        throw error;
      }

      setRegisteredToken(token);
      return token;

    } finally {
      setIsRegistering(false);
    }
  };

  return {
    registerPush,
    registeredToken,
    isRegistering
  };
}
