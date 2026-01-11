import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

// In-memory cache to provide synchronous access for Supabase auth
// This solves the issue where Supabase expects sync storage but Capacitor is async
let memoryCache: Record<string, string> = {};
let initialized = false;
let initializationPromise: Promise<void> | null = null;

// Debug mode - set to true for verbose logging
const DEBUG_STORAGE = false;

const log = (...args: any[]) => {
  if (DEBUG_STORAGE && Capacitor.isNativePlatform()) {
    console.log(...args);
  }
};

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
      
      // Load all known session keys
      const keysToLoad = ['didi-worker-session', 'didi_session'];
      
      for (const key of keysToLoad) {
        try {
          const { value } = await Preferences.get({ key });
          if (value) {
            memoryCache[key] = value;
            console.log(`✅ Loaded ${key} into memory cache (${value.length} chars)`);
          } else {
            log(`ℹ️ No value found for ${key}`);
          }
        } catch (e) {
          console.error(`❌ Failed to load ${key}:`, e);
        }
      }
      
      initialized = true;
      console.log('✅ Storage cache initialized with', Object.keys(memoryCache).length, 'keys');
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
      console.log('🔄 Session reloaded from persistent storage');
    } else {
      console.log('⚠️ No session found in persistent storage during reload');
    }
  } catch (error) {
    console.error('❌ Failed to reload session:', error);
  }
};

// Get raw session from persistent storage (for recovery)
export const getRawSessionFromStorage = async (): Promise<string | null> => {
  if (!Capacitor.isNativePlatform()) {
    return localStorage.getItem('didi-worker-session');
  }
  
  try {
    const { value } = await Preferences.get({ key: 'didi-worker-session' });
    return value;
  } catch (error) {
    console.error('❌ Failed to get raw session:', error);
    return null;
  }
};

// Check if storage has been initialized
export const isStorageInitialized = (): boolean => initialized;

// Get memory cache contents for debugging
export const getStorageCacheDebug = (): { keys: string[]; initialized: boolean } => ({
  keys: Object.keys(memoryCache),
  initialized
});

// Safely parse JSON without throwing
const safeJsonParse = (value: string, key: string): any => {
  try {
    return JSON.parse(value);
  } catch (e) {
    console.error(`⚠️ JSON parse error for ${key}, keeping raw value:`, e);
    // Don't clear - keep raw value for debugging
    return null;
  }
};

export const capacitorStorage = {
  // Supabase calls this synchronously, so we MUST return synchronously from cache
  getItem(key: string): string | null {
    const value = getItemSync(key);
    log(`📖 Storage GET [${key}]: ${value ? 'found' : 'not found'} (init: ${initialized})`);
    return value;
  },
  
  async setItem(key: string, value: string): Promise<void> {
    try {
      if (Capacitor.isNativePlatform()) {
        // Validate JSON before storing (Supabase session is JSON)
        if (value) {
          safeJsonParse(value, key); // Just validate, don't need result
        }
        
        // Update memory cache immediately for sync access
        memoryCache[key] = value;
        
        // Persist to storage asynchronously
        await Preferences.set({ key, value });
        
        log(`✅ Storage SET [${key}] (${value.length} chars)`);
      } else {
        localStorage.setItem(key, value);
      }
    } catch (error) {
      console.error(`❌ Storage SET error [${key}]:`, error);
      // Don't throw - storage errors shouldn't crash the app
    }
  },
  
  async removeItem(key: string): Promise<void> {
    try {
      if (Capacitor.isNativePlatform()) {
        // Log the source of the removal for debugging
        console.log(`🗑️ Storage REMOVE [${key}] called from:`, new Error().stack?.split('\n')[2]?.trim());
        
        // Clear from memory cache immediately
        delete memoryCache[key];
        
        await Preferences.remove({ key });
      } else {
        localStorage.removeItem(key);
      }
    } catch (error) {
      console.error(`❌ Storage REMOVE error [${key}]:`, error);
    }
  },
};
