import { supabase } from '@/integrations/supabase/client';
import { Capacitor } from '@capacitor/core';
import { capacitorStorage, getRawSessionFromStorage } from './capacitorStorage';
import { Session } from '@supabase/supabase-js';

// @ts-ignore - Capacitor bridge
const AuthBridge = (window as any).Capacitor?.Plugins?.AuthBridge;

// Global lock to prevent concurrent refresh attempts
let isRefreshing = false;
let refreshPromise: Promise<Session | null> | null = null;
let lastRefreshTime = 0;
const MIN_REFRESH_INTERVAL = 10000; // 10 seconds minimum between refreshes

// Flag to track intentional logout - ONLY set when user explicitly logs out
let isIntentionalLogout = false;

/**
 * Mark that user is intentionally logging out
 * This prevents recovery attempts during explicit logout
 */
export function setIntentionalLogout(value: boolean): void {
  isIntentionalLogout = value;
  console.log(`🚪 Intentional logout flag set to: ${value}`);
}

/**
 * Check if logout was intentional
 */
export function wasIntentionalLogout(): boolean {
  return isIntentionalLogout;
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
  if (!isIntentionalLogout) {
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
  
  try {
    const rawSession = await getRawSessionFromStorage();
    if (!rawSession) {
      console.log('ℹ️ No raw session in storage to restore');
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
        console.error('❌ Failed to restore session:', error);
        // Don't return null - we still have the stored tokens
        // Try refresh instead
        return await safeRefreshSession();
      }
      
      if (data.session) {
        console.log('✅ Session restored from storage');
        await saveSessionToNative(data.session);
        if (data.session.access_token) {
          await saveJWTToNative(data.session.access_token);
        }
        return data.session;
      }
    }
    
    return null;
  } catch (error) {
    console.error('❌ Error restoring session:', error);
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
      console.log('🔄 Starting session refresh...');
      
      // First, get the current session to check if it's still valid
      const { data: currentData, error: currentError } = await supabase.auth.getSession();
      
      if (currentError) {
        console.error('❌ Error getting current session:', currentError);
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
        await saveSessionToNative(currentSession);
        if (currentSession.access_token) {
          await saveJWTToNative(currentSession.access_token);
        }
        return currentSession;
      }
      
      // Need to refresh
      console.log('🔄 Token expiring soon, refreshing...');
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      
      if (refreshError) {
        console.error('❌ Refresh error:', refreshError);
        
        // If refresh token was already used, try to get session again
        // Another tab/process might have refreshed it
        if (refreshError.message?.includes('refresh_token_already_used') ||
            refreshError.message?.includes('Invalid Refresh Token')) {
          console.log('🔄 Refresh token conflict, trying getSession...');
          const { data: retryData } = await supabase.auth.getSession();
          if (retryData.session) {
            await saveSessionToNative(retryData.session);
            if (retryData.session.access_token) {
              await saveJWTToNative(retryData.session.access_token);
            }
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
        console.log('✅ Session refreshed successfully');
        await saveSessionToNative(refreshData.session);
        if (refreshData.session.access_token) {
          await saveJWTToNative(refreshData.session.access_token);
        }
        return refreshData.session;
      }
      
      return currentSession;
    } catch (error) {
      console.error('❌ Unexpected refresh error:', error);
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
