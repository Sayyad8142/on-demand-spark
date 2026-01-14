import { useEffect, useRef } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { reloadSessionFromStorage } from '@/lib/capacitorStorage';
import { persistSessionAtomic, tryRestoreSessionFromStorage } from '@/lib/sessionManager';

/**
 * Hook to handle app lifecycle events (foreground/background)
 * On resume, ensures storage cache is fresh and lets supabase-js handle refresh
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
          
          // Debounce - don't handle if we just handled within 3 seconds
          if (now - lastResumeTimeRef.current < 3000) {
            console.log('📱 App resume debounced (too soon)');
            return;
          }
          
          // Prevent concurrent handling
          if (isHandlingRef.current) {
            console.log('📱 App state change already being handled');
            return;
          }
          
          isHandlingRef.current = true;
          lastResumeTimeRef.current = now;
          console.log('📱 App became active, syncing session...');
          
          try {
            // Reload from persistent storage to ensure memory cache is fresh
            await reloadSessionFromStorage();
            
            // Just get the current session - supabase-js will auto-refresh if needed
            const { data, error } = await supabase.auth.getSession();
            
            if (error) {
              console.warn('⚠️ Error getting session on resume:', error);
              // Try restore from storage
              const restored = await tryRestoreSessionFromStorage();
              if (restored) {
                console.log('✅ Session restored on resume');
              }
            } else if (data.session) {
              // Ensure native storage is in sync with latest tokens
              await persistSessionAtomic(data.session);
              console.log('✅ Session synced on resume');
            } else {
              console.log('ℹ️ No session on resume (user may not be logged in)');
            }
          } catch (error) {
            console.error('❌ Error handling app resume:', error);
            // Don't do anything drastic - just log
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