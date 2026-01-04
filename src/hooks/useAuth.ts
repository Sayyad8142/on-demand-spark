import { useEffect, useState, useCallback } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Capacitor } from '@capacitor/core';
import { capacitorStorage, reloadSessionFromStorage, getStorageCacheDebug } from '@/lib/capacitorStorage';

// @ts-ignore - Capacitor bridge
const AuthBridge = (window as any).Capacitor?.Plugins?.AuthBridge;

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Log storage debug info on mount
  useEffect(() => {
    console.log('🔐 useAuth mounted, storage status:', getStorageCacheDebug());
  }, []);

  // Save full session to Capacitor storage (for native overlay access)
  const saveSession = useCallback(async (session: Session | null) => {
    if (!Capacitor.isNativePlatform() || !session) {
      return false;
    }

    try {
      const sessionData = {
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        expiresAt: session.expires_at
      };
      
      await capacitorStorage.setItem('didi_session', JSON.stringify(sessionData));
      return true;
    } catch (error) {
      console.error('❌ Failed to save session:', error);
      return false;
    }
  }, []);

  // Helper function to save JWT with verification and retry logic
  const saveJWT = useCallback(async (token: string) => {
    if (!AuthBridge || !Capacitor.isNativePlatform()) {
      return false;
    }

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await AuthBridge.saveToken({ token });
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const verify = await AuthBridge.getToken();
        if (verify?.token === token) {
          console.log(`✅ JWT saved on attempt ${attempt}`);
          return true;
        }
      } catch (error) {
        console.error(`❌ JWT save attempt ${attempt} failed:`, error);
      }

      if (attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    
    return false;
  }, []);

  // Refresh session and tokens - can be called externally
  const refreshSession = useCallback(async (): Promise<Session | null> => {
    try {
      // First try to reload from storage in case it was updated elsewhere
      await reloadSessionFromStorage();
      
      // Get fresh session from Supabase
      const { data, error } = await supabase.auth.refreshSession();
      
      if (error) {
        console.error('❌ Session refresh error:', error);
        // Try getting existing session
        const { data: sessionData } = await supabase.auth.getSession();
        return sessionData.session;
      }
      
      if (data.session) {
        setSession(data.session);
        setUser(data.session.user);
        await saveSession(data.session);
        if (data.session.access_token) {
          await saveJWT(data.session.access_token);
        }
        console.log('✅ Session refreshed successfully');
        return data.session;
      }
      
      return null;
    } catch (error) {
      console.error('❌ Failed to refresh session:', error);
      return null;
    }
  }, [saveSession, saveJWT]);

  useEffect(() => {
    let mounted = true;
    
    const initAuth = async () => {
      try {
        console.log('🔐 Initializing auth...');
        
        // Get initial session with retry logic
        let retryCount = 0;
        let currentSession = null;
        
        while (retryCount < 3 && !currentSession && mounted) {
          const { data, error } = await supabase.auth.getSession();
          if (error) {
            console.error('❌ Error getting session:', error);
            retryCount++;
            await new Promise(resolve => setTimeout(resolve, 500));
            continue;
          }
          currentSession = data.session;
          
          // If session exists but might be expired, try to refresh
          if (currentSession && currentSession.expires_at) {
            const expiresAt = currentSession.expires_at * 1000;
            const now = Date.now();
            const fiveMinutes = 5 * 60 * 1000;
            
            if (expiresAt - now < fiveMinutes) {
              console.log('🔄 Session expires soon, refreshing...');
              const { data: refreshData } = await supabase.auth.refreshSession();
              if (refreshData.session) {
                currentSession = refreshData.session;
              }
            }
          }
          break;
        }
        
        if (mounted) {
          setSession(currentSession);
          setUser(currentSession?.user ?? null);
          setLoading(false);
          
          if (currentSession) {
            console.log('✅ Session restored, user:', currentSession.user?.id);
            await saveSession(currentSession);
            if (currentSession.access_token) {
              await saveJWT(currentSession.access_token);
            }
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

    // Set up auth state listener - SYNCHRONOUS only, no async calls inside
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        console.log('🔄 Auth state changed:', event);
        
        if (!mounted) return;
        
        setSession(newSession);
        setUser(newSession?.user ?? null);
        setLoading(false);
        
        // Defer async operations with setTimeout to avoid deadlock
        if (newSession?.access_token) {
          setTimeout(async () => {
            await saveSession(newSession);
            await saveJWT(newSession.access_token);
          }, 0);
        } else if (Capacitor.isNativePlatform()) {
          setTimeout(async () => {
            try {
              await capacitorStorage.removeItem('didi_session');
              if (AuthBridge) {
                await AuthBridge.clearToken();
              }
            } catch (error) {
              console.error('❌ Failed to clear session:', error);
            }
          }, 0);
        }
      }
    );

    // Session refresh every 5 minutes to keep tokens fresh
    const intervalId = setInterval(async () => {
      if (!mounted) return;
      
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (currentSession && Capacitor.isNativePlatform()) {
        // Check if token is about to expire (within 10 minutes)
        const expiresAt = currentSession.expires_at ? currentSession.expires_at * 1000 : 0;
        const tenMinutes = 10 * 60 * 1000;
        
        if (Date.now() > expiresAt - tenMinutes) {
          console.log('🔄 Token expiring soon, refreshing...');
          const { data } = await supabase.auth.refreshSession();
          if (data.session) {
            await saveSession(data.session);
            if (data.session.access_token) {
              await saveJWT(data.session.access_token);
            }
          }
        } else {
          // Just save existing tokens
          await saveSession(currentSession);
          if (currentSession.access_token) {
            await saveJWT(currentSession.access_token);
          }
        }
      }
    }, 5 * 60 * 1000); // Every 5 minutes

    return () => {
      mounted = false;
      subscription.unsubscribe();
      clearInterval(intervalId);
    };
  }, [saveSession, saveJWT]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return { user, session, loading, signOut, refreshSession };
}