import { useEffect } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { saveSessionToNative } from '@/lib/authBridge';

/**
 * Hook to handle app lifecycle events (foreground/background)
 * Syncs Supabase session to native when app comes to foreground
 */
export function useAppState() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    
    let listener: any;
    
    const setupListener = async () => {
      listener = await CapApp.addListener('appStateChange', async ({ isActive }) => {
        if (isActive) {
          console.log('📱 App became active - syncing session to native...');
          
          const { data: { session } } = await supabase.auth.getSession();
          
          if (session) {
            console.log('🔐 Syncing session to native on app resume...');
            await saveSessionToNative(session);
            console.log('✅ Session synced to native on app resume');
          } else {
            console.log('⚠️ No session available on app resume');
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

