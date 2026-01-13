import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';
import { getIntentionalLogoutFlag } from './authIntent';
import { authLog } from './authLogger';

// In-memory cache to provide synchronous access for Supabase auth
// This solves the issue where Supabase expects sync storage but Capacitor is async
let memoryCache: Record<string, string> = {};
let initialized = false;
let initializationPromise: Promise<void> | null = null;

// Promise that resolves when storage is truly ready (not just initialized)
let storageReadyResolve: () => void;
export const storageReadyPromise: Promise<void> = new Promise((resolve) => {
  storageReadyResolve = resolve;
});

// Track if we successfully loaded a session
let sessionLoadedFromStorage = false;

// Backup key suffix
const BACKUP_SUFFIX = '-backup';
const PRIMARY_SESSION_KEY = 'didi-worker-session';
const BACKUP_SESSION_KEY = `${PRIMARY_SESSION_KEY}${BACKUP_SUFFIX}`;

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAYS = [200, 400, 800]; // ms

// Synchronous getItem for Supabase - returns from memory cache immediately
// This is critical because Supabase auth calls getItem synchronously on startup
const getItemSync = (key: string): string | null => {
  if (!Capacitor.isNativePlatform()) {
    return localStorage.getItem(key);
  }
  return memoryCache[key] || null;
};

// Validate JSON structure for session
const isValidSessionJson = (value: string | null): boolean => {
  if (!value) return false;
  try {
    const parsed = JSON.parse(value);
    // Check for essential session properties
    return !!(parsed?.access_token || parsed?.refresh_token);
  } catch {
    return false;
  }
};

// Try to read a key from Preferences with retries
const readWithRetry = async (key: string): Promise<string | null> => {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { value } = await Preferences.get({ key });
      if (value) {
        return value;
      }
      // No value but no error - key doesn't exist
      if (attempt === MAX_RETRIES) {
        return null;
      }
    } catch (error) {
      authLog.storageRetry(attempt, error);
    }
    
    // Wait before retry (except on last attempt)
    if (attempt < MAX_RETRIES) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt - 1]));
    }
  }
  return null;
};

// Initialize cache from persistent storage - MUST be called before app renders
export const initializeStorageCache = async (): Promise<void> => {
  if (initialized) {
    return;
  }
  
  // If already initializing, wait for that to complete
  if (initializationPromise) {
    return initializationPromise;
  }
  
  if (!Capacitor.isNativePlatform()) {
    initialized = true;
    sessionLoadedFromStorage = !!localStorage.getItem(PRIMARY_SESSION_KEY);
    storageReadyResolve();
    return;
  }
  
  initializationPromise = (async () => {
    console.log('🔄 Initializing storage cache with retry logic...');
    
    let sessionLoaded = false;
    let attemptsUsed = 0;
    
    // Try to load the primary session key with retries
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      attemptsUsed = attempt;
      try {
        const { value } = await Preferences.get({ key: PRIMARY_SESSION_KEY });
        
        if (isValidSessionJson(value)) {
          memoryCache[PRIMARY_SESSION_KEY] = value!;
          sessionLoaded = true;
          console.log(`✅ Loaded ${PRIMARY_SESSION_KEY} on attempt ${attempt} (${value!.length} chars)`);
          break;
        } else if (value) {
          // Value exists but invalid JSON - try backup
          console.warn(`⚠️ ${PRIMARY_SESSION_KEY} exists but invalid JSON on attempt ${attempt}`);
          const backupValue = await readWithRetry(BACKUP_SESSION_KEY);
          if (isValidSessionJson(backupValue)) {
            memoryCache[PRIMARY_SESSION_KEY] = backupValue!;
            // Also restore the primary key from backup
            await Preferences.set({ key: PRIMARY_SESSION_KEY, value: backupValue! });
            sessionLoaded = true;
            authLog.backupUsed('primary key had invalid JSON');
            break;
          }
        }
        
        // No value found, retry with delay
        if (attempt < MAX_RETRIES) {
          console.log(`ℹ️ No session on attempt ${attempt}, retrying in ${RETRY_DELAYS[attempt - 1]}ms...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt - 1]));
        }
      } catch (error) {
        authLog.storageRetry(attempt, error);
        if (attempt < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt - 1]));
        }
      }
    }
    
    // Also try to load the secondary session key (didi_session) for overlay access
    try {
      const { value } = await Preferences.get({ key: 'didi_session' });
      if (value) {
        memoryCache['didi_session'] = value;
        console.log(`✅ Loaded didi_session (${value.length} chars)`);
      }
    } catch (e) {
      console.warn('⚠️ Failed to load didi_session:', e);
    }
    
    // Mark as ready
    initialized = true;
    sessionLoadedFromStorage = sessionLoaded;
    
    if (sessionLoaded) {
      authLog.storageReady(true, attemptsUsed, MAX_RETRIES);
    } else {
      authLog.storageExhausted(MAX_RETRIES);
    }
    
    console.log('✅ Storage cache initialized. Keys:', Object.keys(memoryCache).length, 'Session loaded:', sessionLoaded);
    
    // Signal that storage is ready
    storageReadyResolve();
  })();
  
  return initializationPromise;
};

// Force reload session from persistent storage
export const reloadSessionFromStorage = async (): Promise<void> => {
  if (!Capacitor.isNativePlatform()) return;
  
  try {
    // Try primary key first
    let value = await readWithRetry(PRIMARY_SESSION_KEY);
    
    // If primary is missing or invalid, try backup
    if (!isValidSessionJson(value)) {
      const backupValue = await readWithRetry(BACKUP_SESSION_KEY);
      if (isValidSessionJson(backupValue)) {
        value = backupValue;
        authLog.backupUsed('primary missing/invalid during reload');
        // Restore primary from backup
        await Preferences.set({ key: PRIMARY_SESSION_KEY, value: backupValue! });
      }
    }
    
    if (value) {
      memoryCache[PRIMARY_SESSION_KEY] = value;
      console.log('🔄 Session reloaded from persistent storage');
    } else {
      console.log('⚠️ No valid session found in storage during reload');
    }
  } catch (error) {
    console.error('❌ Failed to reload session:', error);
  }
};

// Get raw session from persistent storage (for recovery)
export const getRawSessionFromStorage = async (): Promise<string | null> => {
  if (!Capacitor.isNativePlatform()) {
    return localStorage.getItem(PRIMARY_SESSION_KEY);
  }
  
  try {
    // Try primary first
    let value = await readWithRetry(PRIMARY_SESSION_KEY);
    
    // If invalid, try backup
    if (!isValidSessionJson(value)) {
      const backupValue = await readWithRetry(BACKUP_SESSION_KEY);
      if (isValidSessionJson(backupValue)) {
        authLog.backupUsed('primary invalid during getRawSession');
        return backupValue;
      }
    }
    
    return value;
  } catch (error) {
    console.error('❌ Failed to get raw session:', error);
    return null;
  }
};

// Check if storage has been initialized
export const isStorageInitialized = (): boolean => initialized;

// Check if a session was loaded from storage during init
export const wasSessionLoadedFromStorage = (): boolean => sessionLoadedFromStorage;

// Get memory cache contents for debugging
export const getStorageCacheDebug = (): { keys: string[]; initialized: boolean; sessionLoaded: boolean } => ({
  keys: Object.keys(memoryCache),
  initialized,
  sessionLoaded: sessionLoadedFromStorage
});

// Safely parse JSON without throwing
const safeJsonParse = (value: string, key: string): any => {
  try {
    return JSON.parse(value);
  } catch (e) {
    console.error(`⚠️ JSON parse error for ${key}:`, e);
    return null;
  }
};

export const capacitorStorage = {
  // Supabase calls this synchronously, so we MUST return synchronously from cache
  getItem(key: string): string | null {
    if (!Capacitor.isNativePlatform()) {
      return localStorage.getItem(key);
    }
    
    let value = memoryCache[key];
    
    // If primary session key is missing or invalid, check backup
    if (key === PRIMARY_SESSION_KEY && !isValidSessionJson(value)) {
      const backupKey = `${key}${BACKUP_SUFFIX}`;
      const backupValue = memoryCache[backupKey];
      if (isValidSessionJson(backupValue)) {
        authLog.backupUsed('primary missing/invalid in getItem');
        value = backupValue;
        // Update memory cache with backup value
        memoryCache[key] = backupValue!;
      }
    }
    
    return value || null;
  },
  
  async setItem(key: string, value: string): Promise<void> {
    try {
      if (Capacitor.isNativePlatform()) {
        // Validate JSON before storing (Supabase session is JSON)
        if (value && key === PRIMARY_SESSION_KEY) {
          const parsed = safeJsonParse(value, key);
          if (!parsed) {
            console.error(`❌ Refusing to save invalid JSON to ${key}`);
            return;
          }
        }
        
        // Update memory cache immediately for sync access
        memoryCache[key] = value;
        
        // Persist to storage
        await Preferences.set({ key, value });
        
        // If this is the primary session key and valid, also save backup
        if (key === PRIMARY_SESSION_KEY && isValidSessionJson(value)) {
          const backupKey = `${key}${BACKUP_SUFFIX}`;
          memoryCache[backupKey] = value;
          await Preferences.set({ key: backupKey, value });
          authLog.tokenPersisted(backupKey, true);
        }
        
        authLog.tokenPersisted(key, true);
      } else {
        localStorage.setItem(key, value);
      }
    } catch (error) {
      console.error(`❌ Storage SET error [${key}]:`, error);
      authLog.tokenPersisted(key, false);
      // Don't throw - storage errors shouldn't crash the app
    }
  },
  
  async removeItem(key: string): Promise<void> {
    try {
      if (Capacitor.isNativePlatform()) {
        const source = new Error().stack?.split('\n')[2]?.trim();

        // Supabase may call storage.removeItem() on transient SIGNED_OUT / refresh races.
        // Never allow the persistent session to be deleted unless the user explicitly logged out.
        if (key === PRIMARY_SESSION_KEY && !getIntentionalLogoutFlag()) {
          console.warn(`🛡️ Blocked Storage REMOVE [${key}] (not intentional logout). From:`, source);
          return;
        }

        // Log the source of the removal for debugging
        console.log(`🗑️ Storage REMOVE [${key}] called from:`, source);

        // Clear from memory cache immediately
        delete memoryCache[key];
        
        // Also clear backup if removing primary
        if (key === PRIMARY_SESSION_KEY) {
          delete memoryCache[BACKUP_SESSION_KEY];
          await Preferences.remove({ key: BACKUP_SESSION_KEY });
        }

        await Preferences.remove({ key });
      } else {
        localStorage.removeItem(key);
      }
    } catch (error) {
      console.error(`❌ Storage REMOVE error [${key}]:`, error);
    }
  },
};
