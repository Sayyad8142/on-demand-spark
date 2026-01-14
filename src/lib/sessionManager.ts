import { supabase } from '@/integrations/supabase/client';
import { Capacitor } from '@capacitor/core';
import { capacitorStorage, getRawSessionFromStorage } from './capacitorStorage';
import { Session } from '@supabase/supabase-js';
import { getIntentionalLogoutFlag, setIntentionalLogoutFlag } from './authIntent';
import { authLog } from './authLogger';

// @ts-ignore - Capacitor bridge
const AuthBridge = (window as any).Capacitor?.Plugins?.AuthBridge;

// Lock for persistence operations to ensure atomicity
let isPersisting = false;
let persistPromise: Promise<boolean> | null = null;

/**
 * Mark that user is intentionally logging out
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
  
  // If already persisting, wait for that to complete then persist again
  if (isPersisting && persistPromise) {
    await persistPromise;
  }
  
  isPersisting = true;
  
  const doWork = async (): Promise<boolean> => {
    try {
      // Save full session to native storage (for Capacitor Preferences)
      const saved = await saveSessionToNative(session);
      
      // Save JWT to AuthBridge (for Android SharedPreferences - used by overlay)
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
 * This is the didi_session that Android services read
 */
export async function saveSessionToNative(session: Session): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || !session) {
    return false;
  }

  try {
    // Store the full session data that Android services need
    const sessionData = {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresAt: session.expires_at,
      userId: session.user?.id,
      updatedAt: Date.now()
    };
    
    await capacitorStorage.setItem('didi_session', JSON.stringify(sessionData));
    console.log('✅ didi_session updated with latest tokens');
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
        console.log(`✅ JWT saved to AuthBridge on attempt ${attempt}`);
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
  
  if (!getIntentionalLogoutFlag()) {
    console.warn('⚠️ clearNativeSession called but logout was NOT intentional - skipping');
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
 * Includes retry logic for "refresh_token_already_used" race condition
 */
export async function tryRestoreSessionFromStorage(): Promise<Session | null> {
  if (!Capacitor.isNativePlatform()) return null;
  
  authLog.restoreAttempt('persistent storage');
  
  const maxAttempts = 3;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Re-read storage on each attempt (token might have been updated by another process)
      const rawSession = await getRawSessionFromStorage();
      if (!rawSession) {
        authLog.restoreResult('persistent storage', false);
        return null;
      }
      
      const parsed = JSON.parse(rawSession);
      
      if (parsed?.access_token && parsed?.refresh_token) {
        console.log(`🔄 Restore attempt ${attempt}/${maxAttempts} from storage...`);
        
        // Try to set the session - supabase-js will refresh if needed
        const { data, error } = await supabase.auth.setSession({
          access_token: parsed.access_token,
          refresh_token: parsed.refresh_token,
        });
        
        if (error) {
          const errorCode = error.message?.toLowerCase() || '';
          const isRotationRace = errorCode.includes('refresh_token_already_used') || 
                                  errorCode.includes('invalid_grant') ||
                                  errorCode.includes('token is expired');
          
          // If it's a rotation race, wait and retry (token might sync)
          if (isRotationRace && attempt < maxAttempts) {
            console.warn(`⚠️ Token rotation race on attempt ${attempt}, waiting before retry...`);
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // 1s, 2s backoff
            continue;
          }
          
          authLog.refreshError(error.name || 'SET_SESSION', error.message);
          
          // Last attempt failed - check if we can use access token if still valid
          if (attempt === maxAttempts && parsed.expires_at) {
            const expiresAt = typeof parsed.expires_at === 'number' 
              ? parsed.expires_at * 1000 
              : new Date(parsed.expires_at).getTime();
            
            if (Date.now() < expiresAt - 60000) {
              // Access token still valid for >1 min, try getSession instead
              console.log('🔄 Access token might still be valid, trying getSession...');
              const { data: getSessionData } = await supabase.auth.getSession();
              if (getSessionData.session) {
                authLog.restoreResult('getSession fallback', true, getSessionData.session.user?.id);
                await persistSessionAtomic(getSessionData.session);
                return getSessionData.session;
              }
            }
          }
          
          return null;
        }
        
        if (data.session) {
          authLog.restoreResult('persistent storage', true, data.session.user?.id);
          // Persist the restored (possibly refreshed) session
          await persistSessionAtomic(data.session);
          return data.session;
        }
      }
      
      authLog.restoreResult('persistent storage', false);
      return null;
    } catch (error: any) {
      if (attempt < maxAttempts) {
        console.warn(`⚠️ Restore attempt ${attempt} error, retrying...`, error);
        await new Promise(resolve => setTimeout(resolve, 500 * attempt));
        continue;
      }
      authLog.refreshError('RESTORE', error?.message || String(error));
      return null;
    }
  }
  
  return null;
}

/**
 * Check if session needs refresh (within 10 minutes of expiry)
 * Note: With autoRefreshToken: true, supabase-js handles this automatically
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
 */
export async function ensureValidSessionForApiCall(): Promise<boolean> {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error('❌ Error checking session for API call:', error);
      return false;
    }
    
    if (!session) {
      console.error('❌ No session for API call');
      // Try restore from storage
      const restored = await tryRestoreSessionFromStorage();
      return !!restored;
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error ensuring session:', error);
    return false;
  }
}