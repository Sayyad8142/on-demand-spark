import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

// In-memory cache to provide synchronous access for Supabase auth
// This solves the issue where Supabase expects sync storage but Capacitor is async
let memoryCache: Record<string, string> = {};
let initialized = false;

// Initialize cache from persistent storage
export const initializeStorageCache = async (): Promise<void> => {
  if (initialized || !Capacitor.isNativePlatform()) {
    return;
  }
  
  try {
    console.log('🔄 Initializing storage cache...');
    const { value } = await Preferences.get({ key: 'didi-worker-session' });
    if (value) {
      memoryCache['didi-worker-session'] = value;
      console.log('✅ Session loaded into memory cache');
    }
    
    // Also load didi_session for native overlay
    const { value: sessionValue } = await Preferences.get({ key: 'didi_session' });
    if (sessionValue) {
      memoryCache['didi_session'] = sessionValue;
    }
    
    initialized = true;
    console.log('✅ Storage cache initialized');
  } catch (error) {
    console.error('❌ Failed to initialize storage cache:', error);
  }
};

// Supabase expects a synchronous storage adapter.
// On native, we use an in-memory cache for sync reads and persist changes asynchronously.
export const supabaseStorage = {
  getItem(key: string): string | null {
    try {
      if (Capacitor.isNativePlatform()) {
        return memoryCache[key] ?? null;
      }
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },

  setItem(key: string, value: string) {
    try {
      if (Capacitor.isNativePlatform()) {
        memoryCache[key] = value;
        // Fire-and-forget persistence (Supabase calls this synchronously)
        void Preferences.set({ key, value });
      } else {
        localStorage.setItem(key, value);
      }
    } catch {
      // ignore
    }
  },

  removeItem(key: string) {
    try {
      if (Capacitor.isNativePlatform()) {
        delete memoryCache[key];
        void Preferences.remove({ key });
      } else {
        localStorage.removeItem(key);
      }
    } catch {
      // ignore
    }
  },
};

// Async helper storage used by our app code (e.g., didi_session backup).
export const capacitorStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      if (Capacitor.isNativePlatform()) {
        // First check memory cache for immediate access
        if (memoryCache[key]) {
          return memoryCache[key];
        }

        // Fall back to persistent storage
        const { value } = await Preferences.get({ key });
        if (value) {
          memoryCache[key] = value; // Update cache
        }
        console.log(`📖 Storage GET [${key}]:`, value ? 'Found' : 'Not found');
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

        // Verify it was saved
        const verify = await Preferences.get({ key });
        if (verify.value === value) {
          console.log(`✅ Storage SET verified [${key}]`);
        } else {
          console.error(`❌ Storage SET verification failed [${key}]`);
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

