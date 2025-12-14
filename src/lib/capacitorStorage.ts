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
