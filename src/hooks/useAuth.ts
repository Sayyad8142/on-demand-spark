import { useEffect, useState, useCallback, useRef } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Capacitor } from '@capacitor/core';
import { capacitorStorage, reloadSessionFromStorage, getStorageCacheDebug, forcePersistSession } from '@/lib/capacitorStorage';

// @ts-ignore - Capacitor bridge
const AuthBridge = (window as any).Capacitor?.Plugins?.AuthBridge;

// Global mutex to prevent concurrent refresh attempts
let isRefreshing = false;
let refreshPromise: Promise<Session | null> | null = null;

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);
  const lastRefreshTimeRef = useRef<number>(0);

  // Log storage debug info on mount
  useEffect(() => {
    console.log('🔐 useAuth mounted, storage status:', getStorageCacheDebug());
  }, []);

  // Save full session to Capacitor storage (for native overlay access)
  const saveSession = useCallback(async (sess: Session | null) => {
    if (!Capacitor.isNativePlatform() || !sess) {
      return false;
    }

    try {
      const sessionData = {
        accessToken: sess.access_token,
        refreshToken: sess.refresh_token,
        expiresAt: sess.expires_at
      };
      
      // Save to legacy key for native Android
      await capacitorStorage.setItem('didi_session', JSON.stringify(sessionData));
      
      // Force persist main session key
      await forcePersistSession();
      
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

  // Clear all session data on token revocation
  const clearSessionCompletely = useCallback(async () => {
    console.log('🗑️ Clearing session completely due to token revocation');
    setSession(null);
    setUser(null);
    
    if (Capacitor.isNativePlatform()) {
      try {
        await capacitorStorage.removeItem('didi_session');
        await capacitorStorage.removeItem('didi-worker-session');
        if (AuthBridge) {
          await AuthBridge.clearToken();
        }
      } catch (e) {
        console.error('❌ Failed to clear session:', e);
      }
    }
  }, []);

  // Refresh session with mutex to prevent concurrent calls
  const refreshSession = useCallback(async (): Promise<Session | null> => {
    // Prevent rapid consecutive refresh calls (min 5 second gap)
    const now = Date.now();
    if (now - lastRefreshTimeRef.current < 5000) {
      console.log('⏳ Refresh called too quickly, skipping...');
      const { data } = await supabase.auth.getSession();
      return data.session;
    }
    
    // If already refreshing, wait for existing refresh to complete
    if (isRefreshing && refreshPromise) {
      console.log('⏳ Refresh already in progress, waiting...');
      return refreshPromise;
    }
    
    isRefreshing = true;
    lastRefreshTimeRef.current = now;
    
    refreshPromise = (async () => {
      try {
        console.log('🔄 Refreshing session...');
        
        // Reload from storage first
        await reloadSessionFromStorage();
        
        const { data, error } = await supabase.auth.refreshSession();
        
        if (error) {
          console.error('❌ Session refresh error:', error.message);
          
          // Token was revoked - clear everything and force re-login
          if (error.message.includes('already_used') || 
              error.message.includes('abuse') ||
              error.message.includes('revoked')) {
            console.log('🚫 Token revoked by Supabase - clearing session');
            await clearSessionCompletely();
            return null;
          }
          
          // For other errors, return current session if still valid
          const { data: sessionData } = await supabase.auth.getSession();
          return sessionData.session;
        }
        
        if (data.session) {
          if (mountedRef.current) {
            setSession(data.session);
            setUser(data.session.user);
          }
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
      } finally {
        isRefreshing = false;
        refreshPromise = null;
      }
    })();
    
    return refreshPromise;
  }, [saveSession, saveJWT, clearSessionCompletely]);

  useEffect(() => {
    mountedRef.current = true;
    
    const initAuth = async () => {
      try {
        console.log('🔐 Initializing auth...');
        
        // Reload session from storage
        await reloadSessionFromStorage();
        const storageDebug = getStorageCacheDebug();
        console.log('📦 Storage state:', storageDebug);
        
        // Get session - single attempt, no retry loops that could cause issues
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('❌ Error getting session:', error.message);
          if (mountedRef.current) {
            setLoading(false);
          }
          return;
        }
        
        let currentSession = data.session;
        
        if (currentSession) {
          console.log('✅ Found session, user:', currentSession.user?.id);
          
          // Check token expiry
          const now = Date.now() / 1000;
          const expiresAt = currentSession.expires_at || 0;
          const isExpired = expiresAt < now;
          const isExpiringSoon = expiresAt < now + (10 * 60);
          
          console.log('📅 Token expires:', new Date(expiresAt * 1000).toISOString(), 
                      isExpired ? '(EXPIRED)' : isExpiringSoon ? '(expiring soon)' : '(valid)');
          
          // Only refresh if actually needed
          if (isExpired || isExpiringSoon) {
            console.log('🔄 Token needs refresh...');
            
            try {
              const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
              
              if (refreshError) {
                console.error('⚠️ Refresh failed:', refreshError.message);
                
                // Token was revoked - user MUST re-login
                if (refreshError.message.includes('already_used') || 
                    refreshError.message.includes('abuse') ||
                    refreshError.message.includes('revoked')) {
                  console.log('🚫 Token revoked - forcing re-login');
                  await clearSessionCompletely();
                  currentSession = null;
                } else if (!isExpired) {
                  // Token not fully expired, keep using it
                  console.log('ℹ️ Keeping existing session (not yet expired)');
                } else {
                  // Fully expired and can't refresh
                  currentSession = null;
                }
              } else if (refreshData.session) {
                console.log('✅ Session refreshed on startup');
                currentSession = refreshData.session;
              }
            } catch (refreshErr) {
              console.error('⚠️ Refresh threw:', refreshErr);
              if (isExpired) {
                currentSession = null;
              }
            }
          }
        } else {
          console.log('ℹ️ No session found in storage');
        }
        
        if (mountedRef.current) {
          setSession(currentSession);
          setUser(currentSession?.user ?? null);
          setLoading(false);
          
          if (currentSession) {
            await saveSession(currentSession);
            if (currentSession.access_token) {
              await saveJWT(currentSession.access_token);
            }
          }
        }
      } catch (error) {
        console.error('❌ Auth init error:', error);
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    };

    initAuth();

    // Auth state listener - keep it synchronous
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        console.log('🔄 Auth state:', event, newSession ? 'session' : 'no session');
        
        if (!mountedRef.current) return;
        
        setSession(newSession);
        setUser(newSession?.user ?? null);
        setLoading(false);
        
        // Defer async operations
        if (newSession?.access_token) {
          setTimeout(async () => {
            await saveSession(newSession);
            await saveJWT(newSession.access_token);
          }, 0);
        } else if (Capacitor.isNativePlatform() && event === 'SIGNED_OUT') {
          setTimeout(async () => {
            await clearSessionCompletely();
          }, 0);
        }
      }
    );

    // Periodic refresh every 10 minutes (reduced frequency to prevent abuse detection)
    const intervalId = setInterval(async () => {
      if (!mountedRef.current) return;
      
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (currentSession) {
          const expiresAt = currentSession.expires_at ? currentSession.expires_at * 1000 : 0;
          const fifteenMinutes = 15 * 60 * 1000;
          
          // Only refresh if expiring within 15 minutes
          if (Date.now() > expiresAt - fifteenMinutes) {
            console.log('🔄 Periodic refresh - token expiring soon');
            await refreshSession();
          }
        }
      } catch (e) {
        console.error('❌ Periodic check failed:', e);
      }
    }, 10 * 60 * 1000); // Every 10 minutes

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
      clearInterval(intervalId);
    };
  }, [saveSession, saveJWT, refreshSession, clearSessionCompletely]);

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('❌ Sign out error:', error);
    }
    await clearSessionCompletely();
  }, [clearSessionCompletely]);

  return { user, session, loading, signOut, refreshSession };
}