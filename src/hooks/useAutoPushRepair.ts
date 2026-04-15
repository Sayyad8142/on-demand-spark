import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { triggerAutomaticPushRepair } from '@/services/pushRepairCoordinator';

export function useAutoPushRepair(userId: string | undefined) {
  const previousUserIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!userId) {
      previousUserIdRef.current = undefined;
      return;
    }

    const source = previousUserIdRef.current === userId ? 'session-restored' : 'login-detected';
    previousUserIdRef.current = userId;

    console.log(`🔐 [PushAutoRepair] ${source}: auth ready for user ${userId}`);
    void triggerAutomaticPushRepair(userId, source);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        console.log('📱 [PushAutoRepair] foreground detected, re-checking push health');
        void triggerAutomaticPushRepair(userId, 'foreground-visible');
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    let nativeListener: { remove: () => Promise<void> | void } | null = null;
    const setupNativeListener = async () => {
      if (!Capacitor.isNativePlatform()) return;

      nativeListener = await CapApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          console.log('📱 [PushAutoRepair] native app resume detected');
          void triggerAutomaticPushRepair(userId, 'native-app-resume');
        }
      });
    };

    void setupNativeListener();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      nativeListener?.remove?.();
    };
  }, [userId]);
}