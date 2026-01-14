import { supabase } from '@/integrations/supabase/client';
import { Capacitor } from '@capacitor/core';
import { capacitorStorage, getRawSessionFromStorage } from './capacitorStorage';
import { Session } from '@supabase/supabase-js';
import { getIntentionalLogoutFlag, setIntentionalLogoutFlag } from './authIntent';
import { authLog } from './authLogger';

// @ts-ignore - Capacitor bridge
const AuthBridge = (window as any).Capacitor?.Plugins?.AuthBridge;

// Global lock to prevent concurrent refresh attempts
let isRefreshing = false;
let refreshPromise: Promise<Session | null> | null = null;
let lastRefreshTime = 0;
const MIN_REFRESH_INTERVAL = 10000; // 10 seconds minimum between refreshes

// Lock for persistence operations to ensure atomicity
let isPersisting = false;
let persistPromise: Promise<boolean> | null = null;

/**
 * Mark that user is intentionally logging out
 * This prevents recovery attempts during explicit logout
 */
export function setIntentionalLogout(value: boolean): void {
  setIntentionalLogoutFlag(value);
  console.log(`🚪 Intentional logout flag set to: ${value}`);
}

/**
 * Check if logout was intentional
 */
export function wasIntentionalLogout(): boolean {
  return getIntentionalLogoutFlag();
}

/**
 * Atomically persist session to native storage
 * Uses a lock to prevent overlapping writes
 */
export async function persistSessionAtomic(session: Session): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || !session) {
    return false;
  }
  
  // If already persisting, wait for that to complete
  if (isPersisting && persistPromise) {
    await persistPromise;
    // After waiting, persist again to ensure our session is saved
  }
  
  isPersisting = true;
  
  const doWork = async (): Promise<boolean> => {
    try {
      // Save full session to native storage
      const saved = await saveSessionToNative(session);
      
      // Save JWT to AuthBridge
      if (session.access_token) {
        await saveJWTToNative(session.access_token);
      }
      
      if (saved) {
        authLog.tokenPersisted('session+jwt', true);
      }
      
      return saved;
    } catch (error) {
      console.error('❌ Atomic persist failed:', error);
      authLog.tokenPersisted('session+jwt', false);
      return false;
    } finally {
      isPersisting = false;
      persistPromise = null;
    }
  };
  
  persistPromise = doWork();
  return persistPromise;
}


/**
 * Save session data to native storage for overlay access
 */
export async function saveSessionToNative(session: Session): Promise<boolean> {
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
    console.error('❌ Failed to save session to native:', error);
    return false;
  }
}

/**
 * Save JWT to native AuthBridge with retry logic
 */
export async function saveJWTToNative(token: string): Promise<boolean> {
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
}

/**
 * Clear all session data from native storage
 * ONLY call this during intentional logout!
 */
export async function clearNativeSession(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  
  // Safety check - only clear if logout was intentional
  if (!getIntentionalLogoutFlag()) {
    console.warn('⚠️ clearNativeSession called but logout was NOT intentional - skipping clear');
    return;
  }
  
  try {
    await capacitorStorage.removeItem('didi_session');
    await capacitorStorage.removeItem('didi-worker-session');
    if (AuthBridge) {
      await AuthBridge.clearToken();
    }
    console.log('🗑️ Native session cleared (intentional logout)');
  } catch (error) {
    console.error('❌ Failed to clear native session:', error);
  }
}

/**
 * Force clear session - use with extreme caution, only for dev/debug
 */
export async function forceClearNativeSession(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  
  console.warn('⚠️ FORCE clearing native session');
  
  try {
    await capacitorStorage.removeItem('didi_session');
    await capacitorStorage.removeItem('didi-worker-session');
    if (AuthBridge) {
      await AuthBridge.clearToken();
    }
    console.log('🗑️ Native session force cleared');
  } catch (error) {
    console.error('❌ Failed to force clear native session:', error);
  }
}

/**
 * Try to restore session from persistent storage
 * Used when we get a transient SIGNED_OUT event
 */
export async function tryRestoreSessionFromStorage(): Promise<Session | null> {
  if (!Capacitor.isNativePlatform()) return null;
  
  authLog.restoreAttempt('persistent storage');
  
  try {
    const rawSession = await getRawSessionFromStorage();
    if (!rawSession) {
      authLog.restoreResult('persistent storage', false);
      return null;
    }
    
    // Parse the stored session
    const parsed = JSON.parse(rawSession);
    
    // The stored format from Supabase is different - it has access_token, refresh_token, etc.
    if (parsed?.access_token && parsed?.refresh_token) {
      console.log('🔄 Attempting to restore session from storage...');
      
      // Try to set the session in Supabase
      const { data, error } = await supabase.auth.setSession({
        access_token: parsed.access_token,
        refresh_token: parsed.refresh_token,
      });
      
      if (error) {
        authLog.refreshError(error.name || 'SET_SESSION', error.message);
        // Avoid calling safeRefreshSession() from here (can cause recursion/refresh races).
        // Let higher-level logic decide what to do next.
        return null;
      }
      
      if (data.session) {
        authLog.restoreResult('persistent storage', true, data.session.user?.id);
        await persistSessionAtomic(data.session);
        return data.session;
      }
    }
    
    authLog.restoreResult('persistent storage', false);
    return null;
  } catch (error: any) {
    authLog.refreshError('RESTORE', error?.message || String(error));
    return null;
  }
}

/**
 * Safely refresh the session with lock to prevent concurrent refreshes
 * This prevents the "refresh_token_already_used" error
 * NEVER triggers logout on failure - always returns current/stored session
 */
export async function safeRefreshSession(): Promise<Session | null> {
  const now = Date.now();
  
  // If already refreshing, wait for that to complete
  if (isRefreshing && refreshPromise) {
    console.log('🔄 Refresh already in progress, waiting...');
    return refreshPromise;
  }
  
  // Prevent too frequent refreshes
  if (now - lastRefreshTime < MIN_REFRESH_INTERVAL) {
    console.log('⏳ Too soon to refresh, getting current session...');
    const { data } = await supabase.auth.getSession();
    return data.session;
  }
  
  isRefreshing = true;
  lastRefreshTime = now;
  
  refreshPromise = (async () => {
    try {
      authLog.refreshStart('manual refresh');
      
      // First, get the current session to check if it's still valid
      const { data: currentData, error: currentError } = await supabase.auth.getSession();
      
      if (currentError) {
        authLog.refreshError('GET_SESSION', currentError.message);
        // DON'T return null - try to restore from storage
        return await tryRestoreSessionFromStorage();
      }
      
      const currentSession = currentData.session;
      
      // If no session in memory, try to restore from storage
      if (!currentSession) {
        console.log('ℹ️ No session in memory, trying storage restore...');
        return await tryRestoreSessionFromStorage();
      }
      
      // Check if token is still valid (more than 5 minutes remaining)
      const expiresAt = currentSession.expires_at ? currentSession.expires_at * 1000 : 0;
      const fiveMinutes = 5 * 60 * 1000;
      
      if (expiresAt > now + fiveMinutes) {
        console.log('✅ Session still valid, no refresh needed');
        // Still save to native storage to ensure it's synced
        await persistSessionAtomic(currentSession);
        return currentSession;
      }
      
      // Need to refresh
      console.log('🔄 Token expiring soon, refreshing...');
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      
      if (refreshError) {
        const errorCode = refreshError.message?.includes('refresh_token_already_used') 
          ? 'REFRESH_TOKEN_ALREADY_USED'
          : refreshError.message?.includes('Invalid Refresh Token')
          ? 'INVALID_REFRESH_TOKEN'
          : refreshError.name || 'REFRESH_ERROR';
          
        authLog.refreshError(errorCode, refreshError.message);
        
        // If refresh token was already used, try to get session again
        // Another tab/process might have refreshed it
        if (errorCode === 'REFRESH_TOKEN_ALREADY_USED' || errorCode === 'INVALID_REFRESH_TOKEN') {
          console.log('🔄 Refresh token conflict, trying getSession...');
          const { data: retryData } = await supabase.auth.getSession();
          if (retryData.session) {
            await persistSessionAtomic(retryData.session);
            return retryData.session;
          }
          
          // Still no session - try storage restore as last resort
          console.log('🔄 Trying storage restore after refresh conflict...');
          return await tryRestoreSessionFromStorage();
        }
        
        // Network error or other transient issue - return current session
        // DO NOT logout on refresh failure
        console.log('⚠️ Refresh failed but keeping current session');
        return currentSession;
      }
      
      if (refreshData.session) {
        authLog.refreshSuccess(refreshData.session.expires_at);
        await persistSessionAtomic(refreshData.session);
        return refreshData.session;
      }
      
      return currentSession;
    } catch (error: any) {
      authLog.refreshError('UNEXPECTED', error?.message || String(error));
      // Try to return current session on error - NEVER logout
      try {
        const { data } = await supabase.auth.getSession();
        return data.session;
      } catch {
        // Last resort - try storage
        return await tryRestoreSessionFromStorage();
      }
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();
  
  return refreshPromise;
}

/**
 * Check if session needs refresh (within 10 minutes of expiry)
 */
export function sessionNeedsRefresh(session: Session | null): boolean {
  if (!session?.expires_at) return false;
  
  const expiresAt = session.expires_at * 1000;
  const tenMinutes = 10 * 60 * 1000;
  
  return Date.now() > expiresAt - tenMinutes;
}

/**
 * Ensure we have a valid session for API calls
 * Returns true if session is valid, false if not
 * NEVER triggers logout - just returns status
 */
export async function ensureValidSessionForApiCall(): Promise<boolean> {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error('❌ Error checking session for API call:', error);
      // Try refresh
      const refreshed = await safeRefreshSession();
      return !!refreshed;
    }
    
    if (!session) {
      console.error('❌ No session for API call');
      // Try restore from storage
      const restored = await tryRestoreSessionFromStorage();
      return !!restored;
    }
    
    // Check if token is about to expire (within 2 minutes)
    const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
    const twoMinutes = 2 * 60 * 1000;
    
    if (Date.now() > expiresAt - twoMinutes) {
      console.log('🔄 Token expiring soon, refreshing before API call...');
      const refreshed = await safeRefreshSession();
      return !!refreshed;
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error ensuring session:', error);
    return false;
  }
}
