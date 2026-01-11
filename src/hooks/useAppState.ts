import { useEffect, useRef } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { safeRefreshSession, tryRestoreSessionFromStorage } from '@/lib/sessionManager';
import { reloadSessionFromStorage } from '@/lib/capacitorStorage';

/**
 * Hook to handle app lifecycle events (foreground/background)
 * Ensures JWT token is refreshed when app comes to foreground
 * Uses safeRefreshSession to prevent concurrent refresh attempts
 * NEVER triggers logout on any error
 */
export function useAppState() {
  const isHandlingRef = useRef(false);
  const lastResumeTimeRef = useRef(0);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    
    let listener: any;
    
    const setupListener = async () => {
      listener = await CapApp.addListener('appStateChange', async ({ isActive }) => {
        if (isActive) {
          const now = Date.now();
          
          // Debounce - don't handle if we just handled within 2 seconds
          if (now - lastResumeTimeRef.current < 2000) {
            console.log('📱 App resume debounced (too soon)');
            return;
          }
          
          // Prevent concurrent handling
          if (isHandlingRef.current) {
            console.log('📱 App state change already being handled, skipping...');
            return;
          }
          
          isHandlingRef.current = true;
          lastResumeTimeRef.current = now;
          console.log('📱 App became active, ensuring session...');
          
          try {
            // First, reload from persistent storage to ensure memory cache is fresh
            await reloadSessionFromStorage();
            
            // Then try safe refresh
            let session = await safeRefreshSession();
            
            // If no session from refresh, try restore from storage
            if (!session) {
              console.log('📱 No session from refresh, trying storage restore...');
              session = await tryRestoreSessionFromStorage();
            }
            
            if (session) {
              console.log('✅ Session ready after app resume');
            } else {
              // Don't log as warning - user might genuinely be logged out
              console.log('ℹ️ No session after app resume (user may not be logged in)');
            }
          } catch (error) {
            console.error('❌ Error handling app resume:', error);
            // DON'T do anything drastic - just log the error
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
