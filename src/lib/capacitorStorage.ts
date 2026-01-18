import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

// In-memory cache to provide synchronous access for Supabase auth
// This solves the issue where Supabase expects sync storage but Capacitor is async
let memoryCache: Record<string, string> = {};
let initialized = false;
let initializationPromise: Promise<void> | null = null;

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
      
      // Load all known session keys - include the exact key Supabase uses
      const keysToLoad = ['didi-worker-session', 'didi_session'];
      
      for (const key of keysToLoad) {
        try {
          const { value } = await Preferences.get({ key });
          if (value) {
            memoryCache[key] = value;
            console.log(`✅ Loaded ${key} into memory cache (${value.length} chars)`);
            
            // Try to parse and validate the session
            if (key === 'didi-worker-session') {
              try {
                const parsed = JSON.parse(value);
                if (parsed?.access_token || parsed?.user) {
                  console.log('✅ Session appears valid, has access_token/user');
                } else {
                  console.log('⚠️ Session structure:', Object.keys(parsed));
                }
              } catch (parseError) {
                console.log('⚠️ Could not parse session for validation');
              }
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
    const { value } = await Preferences.get({ key: 'didi-worker-session' });
    if (value) {
      memoryCache['didi-worker-session'] = value;
      console.log('🔄 Session reloaded from persistent storage (', value.length, 'chars)');
      
      // Also reload didi_session if it exists
      const { value: sessionValue } = await Preferences.get({ key: 'didi_session' });
      if (sessionValue) {
        memoryCache['didi_session'] = sessionValue;
      }
    } else {
      console.log('⚠️ No session found in persistent storage during reload');
      // List all keys to debug
      try {
        const keys = await Preferences.keys();
        console.log('📦 Available Preferences keys:', keys.keys);
      } catch (e) {
        // Ignore
      }
    }
  } catch (error) {
    console.error('❌ Failed to reload session:', error);
  }
};

// Check if storage has been initialized
export const isStorageInitialized = (): boolean => initialized;

// Get memory cache contents for debugging
export const getStorageCacheDebug = (): { keys: string[]; initialized: boolean } => ({
  keys: Object.keys(memoryCache),
  initialized
});

export const capacitorStorage = {
  // Supabase calls this synchronously, so we MUST return synchronously from cache
  getItem(key: string): string | null {
    const value = getItemSync(key);
    if (Capacitor.isNativePlatform()) {
      console.log(`📖 Storage GET [${key}]: ${value ? 'found' : 'not found'} (init: ${initialized})`);
    }
    return value;
  },
  
  async setItem(key: string, value: string): Promise<void> {
    try {
      if (Capacitor.isNativePlatform()) {
        // Update memory cache immediately for sync access
        memoryCache[key] = value;
        
        // Persist to storage asynchronously
        await Preferences.set({ key, value });
        
        console.log(`✅ Storage SET [${key}] (${value.length} chars)`);
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
