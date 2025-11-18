import { useState, useEffect, useCallback } from 'react';
import { Preferences } from '@capacitor/preferences';

interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  key: string;
}

export function useOfflineCache<T>(options: CacheOptions) {
  const { key, ttl = 1000 * 60 * 60 } = options; // Default 1 hour TTL
  const [cachedData, setCachedData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load from cache on mount
  useEffect(() => {
    loadFromCache();
  }, [key]);

  const loadFromCache = async () => {
    try {
      const { value } = await Preferences.get({ key });
      if (value) {
        const parsed = JSON.parse(value);
        const isExpired = Date.now() - parsed.timestamp > ttl;
        
        if (!isExpired) {
          setCachedData(parsed.data);
        } else {
          await clearCache();
        }
      }
    } catch (error) {
      console.error(`Failed to load cache for ${key}:`, error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveToCache = useCallback(async (data: T) => {
    try {
      const cacheData = {
        data,
        timestamp: Date.now()
      };
      await Preferences.set({
        key,
        value: JSON.stringify(cacheData)
      });
      setCachedData(data);
    } catch (error) {
      console.error(`Failed to save cache for ${key}:`, error);
    }
  }, [key]);

  const clearCache = async () => {
    try {
      await Preferences.remove({ key });
      setCachedData(null);
    } catch (error) {
      console.error(`Failed to clear cache for ${key}:`, error);
    }
  };

  return {
    cachedData,
    isLoading,
    saveToCache,
    clearCache
  };
}
