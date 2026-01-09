import { useEffect, useState, useCallback, useRef } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Capacitor } from '@capacitor/core';
import { getStorageCacheDebug } from '@/lib/capacitorStorage';
import { 
  safeRefreshSession, 
  saveSessionToNative, 
  saveJWTToNative,
  clearNativeSession,
  sessionNeedsRefresh
} from '@/lib/sessionManager';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const initRef = useRef(false);

  // Log storage debug info on mount
  useEffect(() => {
    console.log('🔐 useAuth mounted, storage status:', getStorageCacheDebug());
  }, []);

  // Refresh session using the centralized safe refresh
  const refreshSession = useCallback(async (): Promise<Session | null> => {
    const refreshedSession = await safeRefreshSession();
    if (refreshedSession) {
      setSession(refreshedSession);
      setUser(refreshedSession.user);
    }
    return refreshedSession;
  }, []);

  useEffect(() => {
    // Prevent double initialization in React Strict Mode
    if (initRef.current) return;
    initRef.current = true;
    
    let mounted = true;
    
    const initAuth = async () => {
      try {
        console.log('🔐 Initializing auth...');
        
        // Get initial session with retry logic
        let retryCount = 0;
        let currentSession: Session | null = null;
        
        while (retryCount < 3 && !currentSession && mounted) {
          const { data, error } = await supabase.auth.getSession();
          if (error) {
            console.error('❌ Error getting session:', error);
            retryCount++;
            await new Promise(resolve => setTimeout(resolve, 500));
            continue;
          }
          currentSession = data.session;
          break;
        }
        
        // If session exists but needs refresh, do it safely
        if (currentSession && sessionNeedsRefresh(currentSession)) {
          console.log('🔄 Session needs refresh on init...');
          currentSession = await safeRefreshSession();
        } else if (currentSession) {
          // Session is valid, just save to native storage
          await saveSessionToNative(currentSession);
          if (currentSession.access_token) {
            await saveJWTToNative(currentSession.access_token);
          }
        }
        
        if (mounted) {
          setSession(currentSession);
          setUser(currentSession?.user ?? null);
          setLoading(false);
          
          if (currentSession) {
            console.log('✅ Session restored, user:', currentSession.user?.id);
          } else {
            console.log('ℹ️ No session found');
          }
        }
      } catch (error) {
        console.error('❌ Auth initialization error:', error);
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initAuth();

    // Set up auth state listener - handle events synchronously
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        console.log('🔄 Auth state changed:', event);
        
        if (!mounted) return;
        
        // Handle SIGNED_OUT explicitly
        if (event === 'SIGNED_OUT') {
          setSession(null);
          setUser(null);
          setLoading(false);
          
          // Clear native session asynchronously
          if (Capacitor.isNativePlatform()) {
            setTimeout(() => clearNativeSession(), 0);
          }
          return;
        }
        
        // Update state
        setSession(newSession);
        setUser(newSession?.user ?? null);
        setLoading(false);
        
        // Save to native storage asynchronously
        if (newSession?.access_token && Capacitor.isNativePlatform()) {
          setTimeout(async () => {
            await saveSessionToNative(newSession);
            await saveJWTToNative(newSession.access_token);
          }, 0);
        }
      }
    );

    // Session refresh interval - check every 5 minutes
    const intervalId = setInterval(async () => {
      if (!mounted) return;
      
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      
      if (currentSession && sessionNeedsRefresh(currentSession)) {
        console.log('🔄 Scheduled token refresh...');
        await safeRefreshSession();
      }
    }, 5 * 60 * 1000);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      clearInterval(intervalId);
    };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return { user, session, loading, signOut, refreshSession };
}
