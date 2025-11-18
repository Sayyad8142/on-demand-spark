import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

export function useOfflineMode() {
  const [isOnline, setIsOnline] = useState(true);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    // Initial check
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      console.log('📶 Network: Online');
      setIsOnline(true);
      if (wasOffline) {
        // Trigger sync when coming back online
        window.dispatchEvent(new CustomEvent('networkReconnected'));
        setWasOffline(false);
      }
    };

    const handleOffline = () => {
      console.log('📵 Network: Offline');
      setIsOnline(false);
      setWasOffline(true);
    };

    // Listen for online/offline events
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // For native apps, also check connection periodically
    let intervalId: number | undefined;
    if (Capacitor.isNativePlatform()) {
      intervalId = window.setInterval(() => {
        const currentOnlineStatus = navigator.onLine;
        if (currentOnlineStatus !== isOnline) {
          if (currentOnlineStatus) {
            handleOnline();
          } else {
            handleOffline();
          }
        }
      }, 5000); // Check every 5 seconds
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isOnline, wasOffline]);

  return { isOnline, wasOffline };
}
