import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Capacitor } from '@capacitor/core';
import { triggerAutomaticPushRepair } from '@/services/pushRepairCoordinator';
import { capacitorStorage, reloadSessionFromStorage, getStorageCacheDebug, forcePersistSession } from '@/lib/capacitorStorage';

// @ts-ignore - Capacitor bridge
const AuthBridge = (window as any).Capacitor?.Plugins?.AuthBridge;

// Global mutex to prevent concurrent refresh attempts
let isRefreshing = false;
let refreshPromise: Promise<Session | null> | null = null;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<Session | null>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);
  const lastRefreshTimeRef = useRef<number>(0);

  const saveSession = useCallback(async (sess: Session | null) => {
    if (!Capacitor.isNativePlatform() || !sess) return false;
    try {
      const sessionData = {
        accessToken: sess.access_token,
        refreshToken: sess.refresh_token,
        expiresAt: sess.expires_at
      };
      await capacitorStorage.setItem('didi_session', JSON.stringify(sessionData));
      await forcePersistSession();
      return true;
    } catch (error) {
      console.error('❌ Failed to save session:', error);
      return false;
    }
  }, []);

  const saveJWT = useCallback(async (token: string) => {
    if (!AuthBridge || !Capacitor.isNativePlatform()) return false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await AuthBridge.saveToken({ token });
        await new Promise(resolve => setTimeout(resolve, 100));
        const verify = await AuthBridge.getToken();
        if (verify?.token === token) return true;
      } catch (error) {
        console.error(`❌ JWT save attempt ${attempt} failed:`, error);
      }
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 300));
    }
    return false;
  }, []);

  const clearSessionCompletely = useCallback(async () => {
    console.log('🗑️ Clearing session completely');
    setSession(null);
    setUser(null);
    if (Capacitor.isNativePlatform()) {
      try {
        await capacitorStorage.removeItem('didi_session');
        await capacitorStorage.removeItem('didi-worker-session');
        if (AuthBridge) await AuthBridge.clearToken();
      } catch (e) {
        console.error('❌ Failed to clear session:', e);
      }
    }
  }, []);

  const refreshSession = useCallback(async (): Promise<Session | null> => {
    const now = Date.now();
    if (now - lastRefreshTimeRef.current < 5000) {
      const { data } = await supabase.auth.getSession();
      return data.session;
    }
    if (isRefreshing && refreshPromise) return refreshPromise;

    isRefreshing = true;
    lastRefreshTimeRef.current = now;

    refreshPromise = (async () => {
      try {
        await reloadSessionFromStorage();
        const { data, error } = await supabase.auth.refreshSession();
        if (error) {
          if (error.message.includes('already_used') || error.message.includes('abuse') || error.message.includes('revoked')) {
            await reloadSessionFromStorage();
            const { data: recoveryData } = await supabase.auth.getSession();
            if (recoveryData.session) {
              await new Promise(resolve => setTimeout(resolve, 500));
              await reloadSessionFromStorage();
              const { data: retryData, error: retryError } = await supabase.auth.refreshSession();
              if (retryData.session && !retryError) {
                if (mountedRef.current) { setSession(retryData.session); setUser(retryData.session.user); }
                await saveSession(retryData.session);
                if (retryData.session.access_token) await saveJWT(retryData.session.access_token);
                return retryData.session;
              }
            }
            await clearSessionCompletely();
            return null;
          }
          const { data: sessionData } = await supabase.auth.getSession();
          return sessionData.session;
        }
        if (data.session) {
          if (mountedRef.current) { setSession(data.session); setUser(data.session.user); }
          await saveSession(data.session);
          if (data.session.access_token) await saveJWT(data.session.access_token);
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
        console.log('[AUTH_INIT] starting auth bootstrap');
        await reloadSessionFromStorage();
        console.log('[SESSION_RESTORE] storage state:', getStorageCacheDebug());

        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.error('[AUTH_INIT] getSession error:', error.message);
          if (mountedRef.current) setLoading(false);
          console.log('[AUTH_READY] unauthenticated (getSession error)');
          return;
        }

        let currentSession = data.session;
        if (currentSession) {
          console.log('[SESSION_RESTORE] found session for', currentSession.user?.id);
          const now = Date.now() / 1000;
          const expiresAt = currentSession.expires_at || 0;
          const isExpired = expiresAt < now;
          const isExpiringSoon = expiresAt < now + (10 * 60);
          console.log('[SESSION_RESTORE] expires:', new Date(expiresAt * 1000).toISOString(), isExpired ? '(EXPIRED)' : isExpiringSoon ? '(expiring soon)' : '(valid)');

          if (isExpired || isExpiringSoon) {
            try {
              const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
              if (refreshError) {
                console.warn('[SESSION_RESTORE] refresh error:', refreshError.message);
                if (refreshError.message.includes('already_used') || refreshError.message.includes('abuse') || refreshError.message.includes('revoked')) {
                  await new Promise(resolve => setTimeout(resolve, 500));
                  await reloadSessionFromStorage();
                  const { data: retryData, error: retryError } = await supabase.auth.refreshSession();
                  if (retryData.session && !retryError) {
                    currentSession = retryData.session;
                    console.log('[SESSION_RESTORE] recovery refresh OK');
                  } else {
                    await clearSessionCompletely();
                    currentSession = null;
                  }
                } else if (!isExpired) {
                  // Session is still valid, keep existing
                } else {
                  currentSession = null;
                }
              } else if (refreshData.session) {
                currentSession = refreshData.session;
                console.log('[SESSION_RESTORE] refresh OK');
              }
            } catch (refreshErr) {
              console.error('[SESSION_RESTORE] refresh threw:', refreshErr);
              if (isExpired) currentSession = null;
            }
          }
        } else {
          console.log('[SESSION_RESTORE] no session in storage');
        }

        if (mountedRef.current) {
          setSession(currentSession);
          setUser(currentSession?.user ?? null);
          setLoading(false);
          console.log('[AUTH_READY]', currentSession ? `authenticated user=${currentSession.user?.id}` : 'unauthenticated');
          if (currentSession) {
            await saveSession(currentSession);
            if (currentSession.access_token) await saveJWT(currentSession.access_token);
          }
        }
      } catch (error) {
        console.error('[AUTH_INIT] fatal error:', error);
        if (mountedRef.current) setLoading(false);
        console.log('[AUTH_READY] unauthenticated (fatal)');
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      console.log('🔄 Auth state:', event, newSession ? 'session' : 'no session');
      if (!mountedRef.current) return;
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setLoading(false);
      if (newSession?.access_token) {
        setTimeout(async () => {
          await saveSession(newSession);
          await saveJWT(newSession.access_token);
        }, 0);

        // Immediately trigger FCM token capture on login/token-refresh (new device, reinstall, etc.)
        if (Capacitor.isNativePlatform() && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
          const uid = newSession.user?.id;
          if (uid) {
            console.log(`🔔 [Auth] ${event}: triggering FCM token sync for new device/session`);
            setTimeout(() => {
              void triggerAutomaticPushRepair(uid, `auth-${event.toLowerCase()}`);
            }, 1500); // small delay for Firebase to be ready
          }
        }
      } else if (Capacitor.isNativePlatform() && event === 'SIGNED_OUT') {
        setTimeout(() => clearSessionCompletely(), 0);
      }
    });

    const intervalId = setInterval(async () => {
      if (!mountedRef.current) return;
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (currentSession) {
          const expiresAt = currentSession.expires_at ? currentSession.expires_at * 1000 : 0;
          if (Date.now() > expiresAt - 15 * 60 * 1000) {
            await refreshSession();
          }
        }
      } catch (e) {
        console.error('❌ Periodic check failed:', e);
      }
    }, 10 * 60 * 1000);

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
      clearInterval(intervalId);
    };
  }, [saveSession, saveJWT, refreshSession, clearSessionCompletely]);

  const signOut = useCallback(async () => {
    try {
      const userId = session?.user?.id;
      if (userId) {
        // Clear token and mark status as missing for clean logout
        await supabase.from('workers').update({ 
          fcm_token: null, 
          fcm_token_status: 'missing',
          updated_at: new Date().toISOString() 
        }).eq('user_id', userId);
        await supabase.from('fcm_tokens').delete().eq('user_id', userId);
      }
    } catch (error) {
      console.error('⚠️ [Logout] FCM cleanup error:', error);
    }
    try { await supabase.auth.signOut(); } catch (error) { console.error('❌ Sign out error:', error); }
    await clearSessionCompletely();
  }, [clearSessionCompletely, session]);

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
