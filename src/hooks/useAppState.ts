import { useEffect } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { reloadSessionFromStorage, forcePersistSession } from '@/lib/capacitorStorage';

/**
 * Hook to handle app lifecycle events (foreground/background)
 * Ensures JWT token is refreshed when app comes to foreground
 * Also ensures session is persisted when app goes to background
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
          
          // First reload session from persistent storage
          await reloadSessionFromStorage();
          
          // Try to get current session
          let { data: { session } } = await supabase.auth.getSession();
          
          // If session exists, check if we need to refresh
          if (session) {
            const now = Date.now() / 1000;
            const expiresAt = session.expires_at || 0;
            const isExpiringSoon = expiresAt < now + (10 * 60); // 10 minutes
            
            if (isExpiringSoon) {
              console.log('🔄 Session expiring soon, refreshing...');
              try {
                const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
                if (!refreshError && refreshData.session) {
                  session = refreshData.session;
                  console.log('✅ Session refreshed on foreground');
                } else if (refreshError) {
                  console.warn('⚠️ Session refresh failed:', refreshError.message);
                  // If it's already_used or abuse error, session is still valid
                  if (!refreshError.message.includes('already_used') && 
                      !refreshError.message.includes('abuse')) {
                    console.error('❌ Session may be invalid');
                  }
                }
              } catch (e) {
                console.error('❌ Session refresh threw error:', e);
              }
            }
          }
          
          // Save JWT to native storage for booking actions
          if (session?.access_token && AuthBridge) {
            // Retry up to 3 times
            for (let attempt = 1; attempt <= 3; attempt++) {
              try {
                console.log(`💾 [Foreground - Attempt ${attempt}/3] Saving JWT...`);
                
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
          } else if (!session) {
            console.warn('⚠️ No session when app came to foreground - user may need to login');
          }
        } else {
          // App going to background - force persist session
          console.log('📱 App going to background, persisting session...');
          await forcePersistSession();
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

