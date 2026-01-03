import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

// In-memory cache to provide synchronous access for Supabase auth
// This solves the issue where Supabase expects sync storage but Capacitor is async
let memoryCache: Record<string, string> = {};
let initialized = false;
let initializationPromise: Promise<void> | null = null;

// Initialize cache from persistent storage
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
            console.log(`✅ Loaded ${key} into memory cache`);
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
    }
  } catch (error) {
    console.error('❌ Failed to reload session:', error);
  }
};

export const capacitorStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      if (Capacitor.isNativePlatform()) {
        // Ensure cache is initialized
        if (!initialized) {
          await initializeStorageCache();
        }
        
        // First check memory cache for immediate access
        if (memoryCache[key]) {
          return memoryCache[key];
        }
        
        // Fall back to persistent storage
        const { value } = await Preferences.get({ key });
        if (value) {
          memoryCache[key] = value; // Update cache
        }
        return value;
      }
      return localStorage.getItem(key);
    } catch (error) {
      console.error(`❌ Storage GET error [${key}]:`, error);
      return null;
    }
  },
  
  async setItem(key: string, value: string): Promise<void> {
    try {
      if (Capacitor.isNativePlatform()) {
        // Update memory cache immediately
        memoryCache[key] = value;
        
        // Persist to storage
        await Preferences.set({ key, value });
        
        console.log(`✅ Storage SET [${key}]`);
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
        // Clear from memory cache
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
