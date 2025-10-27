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
    let syncListener: any;
    
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
      
      // Listen for sync requests from native overlay
      const handleSyncSession = async () => {
        console.log('📡 Received ACTION_SYNC_SESSION from native - syncing session to native');
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await saveSessionToNative(session);
          console.log('✅ Session synced to native on demand (from overlay)');
        } else {
          console.log('⚠️ No session available for on-demand sync');
        }
      };
      
      // @ts-ignore - Custom event from native Android
      window.addEventListener('app.didisnow.worker.ACTION_SYNC_SESSION', handleSyncSession);
      syncListener = () => window.removeEventListener('app.didisnow.worker.ACTION_SYNC_SESSION', handleSyncSession);
    };
    
    setupListener();

    return () => {
      if (listener) {
        listener.remove();
      }
      if (syncListener) {
        syncListener();
      }
    };
  }, []);
}

