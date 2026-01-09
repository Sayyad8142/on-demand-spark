import { useEffect, useRef } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { safeRefreshSession } from '@/lib/sessionManager';

/**
 * Hook to handle app lifecycle events (foreground/background)
 * Ensures JWT token is refreshed when app comes to foreground
 * Uses safeRefreshSession to prevent concurrent refresh attempts
 */
export function useAppState() {
  const isHandlingRef = useRef(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    
    let listener: any;
    
    const setupListener = async () => {
      listener = await CapApp.addListener('appStateChange', async ({ isActive }) => {
        if (isActive) {
          // Prevent concurrent handling
          if (isHandlingRef.current) {
            console.log('📱 App state change already being handled, skipping...');
            return;
          }
          
          isHandlingRef.current = true;
          console.log('📱 App became active, refreshing session...');
          
          try {
            // Use safe refresh that prevents concurrent refreshes
            const session = await safeRefreshSession();
            if (session) {
              console.log('✅ Session ready after app resume');
            } else {
              console.warn('⚠️ No session after app resume');
            }
          } catch (error) {
            console.error('❌ Error handling app resume:', error);
          } finally {
            isHandlingRef.current = false;
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

