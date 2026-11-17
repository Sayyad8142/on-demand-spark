import { useState, useEffect, useCallback, useRef } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { getPushHealthSnapshot } from '@/lib/pushToken';
import {
  getPushRepairStatus,
  subscribePushRepairStatus,
  triggerAutomaticPushRepair,
  triggerManualPushRepair,
  type PushRepairPhase,
} from '@/services/pushRepairCoordinator';

export interface PushHealthState {
  permissionGranted: boolean;
  tokenExists: boolean;
  tokenSyncedToBackend: boolean;
  tokenHealthy: boolean; // backend status !== 'invalid'
  isHealthy: boolean; // all above are true
  isChecking: boolean;
  lastCheckAt: Date | null;
  lastError: string | null;
  repairPhase: PushRepairPhase;
  repairAttempt: number;
  repairMaxAttempts: number;
  manualRepairRequired: boolean;
}

const INITIAL_STATE: PushHealthState = {
  permissionGranted: false,
  tokenExists: false,
  tokenSyncedToBackend: false,
  tokenHealthy: false,
  isHealthy: false,
  isChecking: true,
  lastCheckAt: null,
  lastError: null,
  repairPhase: getPushRepairStatus().phase,
  repairAttempt: 0,
  repairMaxAttempts: getPushRepairStatus().maxAttempts,
  manualRepairRequired: false,
};

/**
 * usePushHealthGuard — Mandatory FCM token health manager.
 *
 * Checks push readiness on mount, resume, and periodically.
 * Provides a `repair()` function that re-registers push and syncs token.
 * Exposes `isHealthy` which must be true before worker can go online.
 */
export function usePushHealthGuard(userId: string | undefined) {
  const [state, setState] = useState<PushHealthState>(INITIAL_STATE);
  const mountedRef = useRef(true);
  const accountRef = useRef(userId);
  accountRef.current = userId;
  const isNative = Capacitor.isNativePlatform();

  const set = (patch: Partial<PushHealthState>) => {
    if (!mountedRef.current) return;
    setState(prev => {
      const next = { ...prev, ...patch };
      next.isHealthy = next.permissionGranted && next.tokenExists && next.tokenSyncedToBackend && next.tokenHealthy;
      return next;
    });
  };

  /**
   * Full health check: permission → local token → backend token status
   */
  const checkHealth = useCallback(async (options?: { autoRepair?: boolean; source?: string }): Promise<boolean> => {
    if (!userId || !isNative) return true;
    set({ isChecking: true, lastError: null });

    try {
      const snapshot = await getPushHealthSnapshot(userId, permissionGranted => {
        if (accountRef.current === userId) set({ permissionGranted });
      });
      if (accountRef.current !== userId) return false;

      set({
        permissionGranted: snapshot.permissionGranted,
        tokenExists: snapshot.tokenExists,
        tokenSyncedToBackend: snapshot.tokenSyncedToBackend,
        tokenHealthy: snapshot.tokenHealthy,
        isChecking: false,
        lastCheckAt: new Date(),
        lastError: null,
      });

      console.log(`🛡️ [PushHealth] Check: perm=${snapshot.permissionGranted} token=${snapshot.tokenExists} synced=${snapshot.tokenSyncedToBackend} healthy=${snapshot.tokenHealthy} → ${snapshot.isHealthy ? '✅' : '❌'}`);

      if (!snapshot.isHealthy && (options?.autoRepair ?? true)) {
        console.log(`🚀 [PushHealth] ${options?.source || 'health-check'}: unhealthy state detected, starting auto repair`);
        void triggerAutomaticPushRepair(userId, options?.source || 'health-check');
      }

      return snapshot.isHealthy;
    } catch (e: any) {
      console.error('❌ [PushHealth] Check failed:', e);
      if (accountRef.current === userId) set({ isChecking: false, lastError: e.message });
      return false;
    }
  }, [userId, isNative]);

  /**
   * Full repair: request permission → re-register → get token → sync to backend
   */
  const repair = useCallback(async (): Promise<boolean> => {
    if (!userId || !isNative) return true;
    console.log('🔧 [PushHealth] Starting manual repair fallback...');
    await triggerManualPushRepair(userId);
    // Always read back: permission may succeed while registration/sync fails.
    return checkHealth({ autoRepair: false, source: 'manual-repair-readback' });
  }, [userId, isNative, checkHealth]);

  useEffect(() => {
    if (!userId || !isNative) {
      setState(prev => ({ ...prev, isHealthy: true, isChecking: false }));
      return;
    }

    return subscribePushRepairStatus((status) => {
      const inProgress = status.phase === 'checking' || status.phase === 'preparing';
      set({
        isChecking: inProgress,
        repairPhase: status.phase,
        repairAttempt: status.attempt,
        repairMaxAttempts: status.maxAttempts,
        manualRepairRequired: status.manualRequired,
        lastError: status.phase === 'failed' ? status.lastError : null,
      });

      if (status.phase === 'success') {
        void checkHealth({ autoRepair: false, source: 'repair-success' });
      }
    });
  }, [userId, checkHealth]);

  // Run check on mount, userId change, and app resume
  useEffect(() => {
    mountedRef.current = true;
    if (!userId || !isNative) return;

    setState({ ...INITIAL_STATE });
    void checkHealth({ autoRepair: true, source: 'push-guard-mount' });

    // Periodic check every 3 minutes
    const interval = setInterval(() => checkHealth({ autoRepair: true, source: 'push-guard-interval' }), 3 * 60 * 1000);

    // Check on resume
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        console.log('🛡️ [PushHealth] App resumed, re-checking...');
        void checkHealth({ autoRepair: true, source: 'push-guard-resume' });
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    const resume = App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void checkHealth({ autoRepair: true, source: 'push-guard-native-resume' });
    });
    const onOnline = () => { void checkHealth({ autoRepair: true, source: 'push-guard-reconnect' }); };
    window.addEventListener('online', onOnline);

    return () => {
      mountedRef.current = false;
      void resume.then(handle => handle.remove());
      window.removeEventListener('online', onOnline);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [userId, checkHealth]);

  return { ...state, checkHealth, repair };
}
