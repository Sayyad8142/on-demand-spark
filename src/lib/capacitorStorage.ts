import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

// In-memory cache to provide synchronous access for Supabase auth
// This solves the issue where Supabase expects sync storage but Capacitor is async
let memoryCache: Record<string, string> = {};
let initialized = false;
let initializationPromise: Promise<void> | null = null;

// The exact key Supabase uses for session storage
const SESSION_KEY = 'didi-worker-session';
const LEGACY_SESSION_KEY = 'didi_session';

// Synchronous getItem for Supabase - returns from memory cache immediately
// This is critical because Supabase auth calls getItem synchronously on startup
const getItemSync = (key: string): string | null => {
  if (!Capacitor.isNativePlatform()) {
    return localStorage.getItem(key);
  }
  return memoryCache[key] || null;
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
    return;
  }
  
  initializationPromise = (async () => {
    try {
      console.log('🔄 Initializing storage cache...');
      
      // First, list ALL available keys for debugging
      try {
        const allKeys = await Preferences.keys();
        console.log('📦 All available Preferences keys:', allKeys.keys);
      } catch (e) {
        console.log('⚠️ Could not list keys:', e);
      }
      
      // Load all known session keys - include the exact key Supabase uses
      const keysToLoad = [SESSION_KEY, LEGACY_SESSION_KEY, 'sb-paywwbuqycovjopryele-auth-token'];
      
      for (const key of keysToLoad) {
        try {
          const { value } = await Preferences.get({ key });
          if (value) {
            memoryCache[key] = value;
            console.log(`✅ Loaded ${key} into memory cache (${value.length} chars)`);
            
            // Try to parse and validate the session
            try {
              const parsed = JSON.parse(value);
              if (parsed?.access_token || parsed?.user) {
                console.log(`✅ ${key} session appears valid, has access_token/user`);
                console.log(`📅 Expires at: ${parsed.expires_at ? new Date(parsed.expires_at * 1000).toISOString() : 'unknown'}`);
              } else {
                console.log(`⚠️ ${key} session structure:`, Object.keys(parsed));
              }
            } catch (parseError) {
              console.log(`⚠️ Could not parse ${key} for validation`);
            }
          } else {
            console.log(`ℹ️ No value found for ${key}`);
          }
        } catch (e) {
          console.error(`❌ Failed to load ${key}:`, e);
        }
      }
      
      initialized = true;
      console.log('✅ Storage cache initialized with', Object.keys(memoryCache).length, 'keys:', Object.keys(memoryCache));
    } catch (error) {
      console.error('❌ Failed to initialize storage cache:', error);
      initialized = true; // Mark as initialized even on failure to prevent infinite loops
    }
  })();
  
  return initializationPromise;
};

// Force reload session from persistent storage
export const reloadSessionFromStorage = async (): Promise<void> => {
  if (!Capacitor.isNativePlatform()) return;
  
  try {
    console.log('🔄 Reloading session from persistent storage...');
    
    // Try multiple keys
    const keysToLoad = [SESSION_KEY, LEGACY_SESSION_KEY, 'sb-paywwbuqycovjopryele-auth-token'];
    
    for (const key of keysToLoad) {
      const { value } = await Preferences.get({ key });
      if (value) {
        memoryCache[key] = value;
        console.log(`🔄 Reloaded ${key} (${value.length} chars)`);
      }
    }
    
    // List all keys for debugging
    try {
      const keys = await Preferences.keys();
      console.log('📦 Available Preferences keys after reload:', keys.keys);
    } catch (e) {
      // Ignore
    }
  } catch (error) {
    console.error('❌ Failed to reload session:', error);
  }
};

// Check if storage has been initialized
export const isStorageInitialized = (): boolean => initialized;

// Get memory cache contents for debugging
export const getStorageCacheDebug = (): { keys: string[]; initialized: boolean; hasSession: boolean } => ({
  keys: Object.keys(memoryCache),
  initialized,
  hasSession: Boolean(memoryCache[SESSION_KEY])
});

// Force persist current memory cache to storage
export const forcePersistSession = async (): Promise<void> => {
  if (!Capacitor.isNativePlatform()) return;
  
  const sessionData = memoryCache[SESSION_KEY];
  if (sessionData) {
    try {
      await Preferences.set({ key: SESSION_KEY, value: sessionData });
      console.log('✅ Force persisted session to storage');
    } catch (e) {
      console.error('❌ Failed to force persist session:', e);
    }
  }
};

export const capacitorStorage = {
  // Supabase calls this synchronously, so we MUST return synchronously from cache
  getItem(key: string): string | null {
    const value = getItemSync(key);
    if (Capacitor.isNativePlatform()) {
      console.log(`📖 Storage GET [${key}]: ${value ? `found (${value.length} chars)` : 'not found'} (init: ${initialized})`);
    }
    return value;
  },
  
  async setItem(key: string, value: string): Promise<void> {
    try {
      if (Capacitor.isNativePlatform()) {
        // Update memory cache immediately for sync access
        memoryCache[key] = value;
        
        // Persist to storage asynchronously but with retry
        let retries = 3;
        while (retries > 0) {
          try {
            await Preferences.set({ key, value });
            
            // Verify the write succeeded
            const verify = await Preferences.get({ key });
            if (verify.value === value) {
              console.log(`✅ Storage SET [${key}] (${value.length} chars) - verified`);
              break;
            } else {
              console.warn(`⚠️ Storage SET [${key}] verification failed, retrying...`);
              retries--;
            }
          } catch (writeError) {
            console.error(`❌ Storage SET [${key}] write failed:`, writeError);
            retries--;
            if (retries > 0) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          }
        }
      } else {
        localStorage.setItem(key, value);
      }
    } catch (error) {
      console.error(`❌ Storage SET error [${key}]:`, error);
      throw error;
    }
  },
  
  async removeItem(key: string): Promise<void> {
    try {
      if (Capacitor.isNativePlatform()) {
        // Clear from memory cache immediately
        delete memoryCache[key];
        
        await Preferences.remove({ key });
        console.log(`🗑️ Storage REMOVE [${key}]`);
      } else {
        localStorage.removeItem(key);
      }
    } catch (error) {
      console.error(`❌ Storage REMOVE error [${key}]:`, error);
    }
  },
};
