import { supabase } from '@/integrations/supabase/client';
import { Capacitor } from '@capacitor/core';
import { capacitorStorage } from './capacitorStorage';
import { Session } from '@supabase/supabase-js';

// @ts-ignore - Capacitor bridge
const AuthBridge = (window as any).Capacitor?.Plugins?.AuthBridge;

// Global lock to prevent concurrent refresh attempts
let isRefreshing = false;
let refreshPromise: Promise<Session | null> | null = null;
let lastRefreshTime = 0;
const MIN_REFRESH_INTERVAL = 10000; // 10 seconds minimum between refreshes

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
 */
export async function clearNativeSession(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  
  try {
    await capacitorStorage.removeItem('didi_session');
    if (AuthBridge) {
      await AuthBridge.clearToken();
    }
    console.log('🗑️ Native session cleared');
  } catch (error) {
    console.error('❌ Failed to clear native session:', error);
  }
}

/**
 * Safely refresh the session with lock to prevent concurrent refreshes
 * This prevents the "refresh_token_already_used" error
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
        return null;
      }
      
      const currentSession = currentData.session;
      
      // If no session, nothing to refresh
      if (!currentSession) {
        console.log('ℹ️ No session to refresh');
        return null;
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
        }
        
        return currentSession; // Return current session even if refresh failed
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
      // Try to return current session on error
      const { data } = await supabase.auth.getSession();
      return data.session;
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
