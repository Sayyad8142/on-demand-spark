import { useEffect, useState, useCallback } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Capacitor } from '@capacitor/core';
import { capacitorStorage, reloadSessionFromStorage, getStorageCacheDebug, forcePersistSession } from '@/lib/capacitorStorage';

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
      
      // Also force persist main session
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

  // Refresh session and tokens - can be called externally
  const refreshSession = useCallback(async (): Promise<Session | null> => {
    try {
      console.log('🔄 Manual session refresh requested...');
      
      // First try to reload from storage in case it was updated elsewhere
      await reloadSessionFromStorage();
      
      // Get fresh session from Supabase
      const { data, error } = await supabase.auth.refreshSession();
      
      if (error) {
        console.error('❌ Session refresh error:', error.message);
        
        // If refresh fails with certain errors, try to get existing session
        if (error.message.includes('already_used') || error.message.includes('abuse')) {
          console.log('ℹ️ Refresh token already used, getting existing session');
          const { data: sessionData } = await supabase.auth.getSession();
          if (sessionData.session) {
            await saveSession(sessionData.session);
            if (sessionData.session.access_token) {
              await saveJWT(sessionData.session.access_token);
            }
          }
          return sessionData.session;
        }
        
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
        
        // First, reload session from storage to ensure we have latest data
        await reloadSessionFromStorage();
        const storageDebug = getStorageCacheDebug();
        console.log('📦 Storage reloaded:', storageDebug);
        
        // Get initial session with retry logic
        let retryCount = 0;
        let currentSession: Session | null = null;
        
        while (retryCount < 3 && !currentSession && mounted) {
          console.log(`🔄 Attempting to get session (attempt ${retryCount + 1}/3)...`);
          
          const { data, error } = await supabase.auth.getSession();
          
          if (error) {
            console.error('❌ Error getting session:', error.message);
            retryCount++;
            await new Promise(resolve => setTimeout(resolve, 500));
            continue;
          }
          
          currentSession = data.session;
          
          if (currentSession) {
            console.log('✅ Found existing session, user:', currentSession.user?.id);
            console.log('📅 Token expires at:', new Date(currentSession.expires_at! * 1000).toISOString());
            
            // Check if session is expired or about to expire
            const now = Date.now() / 1000;
            const expiresAt = currentSession.expires_at || 0;
            const isExpired = expiresAt < now;
            const isExpiringSoon = expiresAt < now + (10 * 60); // 10 minutes
            
            if (isExpired) {
              console.log('⚠️ Session is expired, attempting refresh...');
            } else if (isExpiringSoon) {
              console.log('⚠️ Session expiring soon, refreshing...');
            }
            
            // Always try to refresh on startup for workers who open app after hours
            if (isExpired || isExpiringSoon) {
              try {
                const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
                
                if (refreshError) {
                  console.error('⚠️ Session refresh failed:', refreshError.message);
                  
                  // Handle specific error cases
                  if (refreshError.message.includes('already_used') || 
                      refreshError.message.includes('abuse') ||
                      refreshError.message.includes('invalid claim')) {
                    console.log('ℹ️ Refresh token issue, keeping current session if still valid');
                    // Keep the existing session if it hasn't fully expired
                    if (!isExpired) {
                      // Session is still valid, just couldn't refresh
                      console.log('✅ Session still valid, continuing with existing session');
                    } else {
                      console.log('❌ Session fully expired and cannot refresh');
                      currentSession = null;
                    }
                  } else if (refreshError.message.includes('expired') || 
                             refreshError.message.includes('invalid')) {
                    console.log('❌ Refresh token expired, user needs to re-login');
                    currentSession = null;
                  }
                  // Otherwise keep existing session
                } else if (refreshData.session) {
                  console.log('✅ Session refreshed successfully on startup');
                  currentSession = refreshData.session;
                }
              } catch (refreshErr) {
                console.error('⚠️ Session refresh threw error:', refreshErr);
                // Keep existing session on error if not fully expired
                if (isExpired) {
                  currentSession = null;
                }
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
            console.log('✅ Auth initialized with session, user:', currentSession.user?.id);
            await saveSession(currentSession);
            if (currentSession.access_token) {
              await saveJWT(currentSession.access_token);
            }
          } else {
            console.log('ℹ️ No valid session found - user needs to login');
            console.log('📦 Storage keys at failure:', storageDebug.keys);
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
        console.log('🔄 Auth state changed:', event, newSession ? 'with session' : 'no session');
        
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
        } else if (Capacitor.isNativePlatform() && event === 'SIGNED_OUT') {
          setTimeout(async () => {
            try {
              await capacitorStorage.removeItem('didi_session');
              await capacitorStorage.removeItem('didi-worker-session');
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
      
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (currentSession) {
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
          } else if (Capacitor.isNativePlatform()) {
            // Just save existing tokens to ensure persistence
            await saveSession(currentSession);
            if (currentSession.access_token) {
              await saveJWT(currentSession.access_token);
            }
          }
        }
      } catch (e) {
        console.error('❌ Periodic session refresh failed:', e);
      }
    }, 5 * 60 * 1000); // Every 5 minutes

    return () => {
      mounted = false;
      subscription.unsubscribe();
      clearInterval(intervalId);
    };
  }, [saveSession, saveJWT]);

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('❌ Sign out error:', error);
      // Clear local storage anyway
      if (Capacitor.isNativePlatform()) {
        await capacitorStorage.removeItem('didi_session');
        await capacitorStorage.removeItem('didi-worker-session');
      }
    }
  }, []);

  return { user, session, loading, signOut, refreshSession };
}