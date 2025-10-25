import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

export const capacitorStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      if (Capacitor.isNativePlatform()) {
        const { value } = await Preferences.get({ key });
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
