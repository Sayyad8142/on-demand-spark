import { useEffect } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';

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
          console.log('📱 App became active, refreshing JWT...');
          
          // Refresh session and save JWT when app comes to foreground
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.access_token && AuthBridge) {
            try {
              await AuthBridge.saveToken({ token: session.access_token });
              console.log('✅ JWT refreshed on app foreground');
            } catch (error) {
              console.error('❌ Failed to refresh JWT on foreground:', error);
            }
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

