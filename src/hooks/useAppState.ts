import { useEffect } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { startBackgroundLocationTracking, isLocationTracking } from '@/lib/backgroundLocation';

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
            // Retry up to 3 times
            for (let attempt = 1; attempt <= 3; attempt++) {
              try {
                console.log(`💾 [Foreground - Attempt ${attempt}/3] Saving JWT...`);
                console.log('🔑 Token preview:', session.access_token.substring(0, 50) + '...');
                
                await AuthBridge.saveToken({ token: session.access_token });
                
                // Wait a bit for the write to complete
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Verify it was actually saved
                const verify = await AuthBridge.getToken();
                if (verify?.token === session.access_token) {
                  console.log(`✅ JWT refreshed and verified on foreground (attempt ${attempt})`);
                  break; // Success, exit loop
                } else {
                  console.error(`❌ JWT verification failed on foreground (attempt ${attempt})`);
                }
              } catch (error) {
                console.error(`❌ Failed to refresh JWT on foreground (attempt ${attempt}):`, error);
              }

              // Wait before retry (except on last attempt)
              if (attempt < 3) {
                await new Promise(resolve => setTimeout(resolve, 300));
              }
            }
          } else {
            console.warn('⚠️ No session or AuthBridge when app came to foreground');
          }

          // Restart location tracking if it was enabled
          if (isLocationTracking()) {
            console.log('📍 App resumed - restarting location tracking');
            await startBackgroundLocationTracking();
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

