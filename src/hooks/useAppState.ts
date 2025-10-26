import { useEffect } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { saveSessionToNative } from '@/native/auth-bridge';

/**
 * Hook to handle app lifecycle events (foreground/background)
 * Ensures JWT token is refreshed when app comes to foreground
 */
export function useAppState() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    // @ts-ignore - Capacitor bridge
    const AuthBridge = (window as any).Capacitor?.Plugins?.AuthBridge;
    
    let listener: any;
    
    const setupListener = async () => {
      listener = await CapApp.addListener('appStateChange', async ({ isActive }) => {
        if (isActive) {
          console.log('📱 App became active, refreshing session...');
          
          // Refresh session and save to native when app comes to foreground
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.access_token && session?.refresh_token && session?.user?.id) {
            await saveSessionToNative({
              accessToken: session.access_token,
              refreshToken: session.refresh_token,
              userId: session.user.id,
              expiresAt: session.expires_at ? Math.floor(session.expires_at) : Math.floor(Date.now() / 1000 + 3600)
            });
          } else {
            console.warn('⚠️ No session when app came to foreground');
          }
        }
      });
    };
    
    setupListener();

    return () => {
      if (listener) {
        listener.remove();
      }
    };
  }, []);
}

