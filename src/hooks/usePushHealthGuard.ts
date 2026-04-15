import { useState, useEffect, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from '@/integrations/supabase/client';

// @ts-ignore - Capacitor bridge
const AuthBridge = (window as any).Capacitor?.Plugins?.AuthBridge;

export interface PushHealthState {
  permissionGranted: boolean;
  tokenExists: boolean;
  tokenSyncedToBackend: boolean;
  tokenHealthy: boolean; // backend status !== 'invalid'
  isHealthy: boolean; // all above are true
  isChecking: boolean;
  lastCheckAt: Date | null;
  lastError: string | null;
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
  const repairingRef = useRef(false);

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
  const checkHealth = useCallback(async (): Promise<boolean> => {
    if (!userId) return false;
    set({ isChecking: true, lastError: null });

    try {
      // 1. Check notification permission
      let permOk = false;
      if (Capacitor.isNativePlatform()) {
        try {
          const perm = await PushNotifications.checkPermissions();
          permOk = perm.receive === 'granted';
        } catch { permOk = false; }
      } else if (typeof Notification !== 'undefined') {
        permOk = Notification.permission === 'granted';
      } else {
        permOk = true; // can't check, assume ok
      }

      // 2. Check local pending token
      let localToken: string | null = null;
      if (Capacitor.isNativePlatform() && AuthBridge) {
        try {
          const result = await AuthBridge.getPendingFCMToken();
          localToken = result?.token ?? null;
        } catch {}
      }

      // 3. Check backend token state
      const { data: worker } = await supabase
        .from('workers')
        .select('fcm_token, fcm_token_status, fcm_token_updated_at')
        .eq('user_id', userId)
        .maybeSingle();

      const backendToken = worker?.fcm_token ?? null;
      const backendStatus = worker?.fcm_token_status ?? null;
      const tokenExists = !!(localToken || backendToken);
      const tokenSyncedToBackend = !!backendToken;
      const tokenHealthy = tokenSyncedToBackend && backendStatus !== 'invalid';

      set({
        permissionGranted: permOk,
        tokenExists,
        tokenSyncedToBackend,
        tokenHealthy,
        isChecking: false,
        lastCheckAt: new Date(),
      });

      const healthy = permOk && tokenExists && tokenSyncedToBackend && tokenHealthy;
      console.log(`🛡️ [PushHealth] Check: perm=${permOk} token=${tokenExists} synced=${tokenSyncedToBackend} healthy=${tokenHealthy} → ${healthy ? '✅' : '❌'}`);

      // Auto-repair: if we have a local token but backend is missing/invalid, sync it
      if (permOk && localToken && (!tokenSyncedToBackend || !tokenHealthy)) {
        console.log('🔧 [PushHealth] Auto-repairing: syncing local token to backend');
        await syncTokenToBackend(localToken, userId);
      }

      return healthy;
    } catch (e: any) {
      console.error('❌ [PushHealth] Check failed:', e);
      set({ isChecking: false, lastError: e.message });
      return false;
    }
  }, [userId]);

  /**
   * Full repair: request permission → re-register → get token → sync to backend
   */
  const repair = useCallback(async (): Promise<boolean> => {
    if (!userId || repairingRef.current) return false;
    repairingRef.current = true;
    set({ isChecking: true, lastError: null });
    console.log('🔧 [PushHealth] Starting full repair...');

    try {
      // Step 1: Request permission
      let permOk = false;
      if (Capacitor.isNativePlatform()) {
        try {
          let perm = await PushNotifications.checkPermissions();
          if (perm.receive !== 'granted') {
            perm = await PushNotifications.requestPermissions();
          }
          permOk = perm.receive === 'granted';
        } catch { permOk = false; }
      } else if (typeof Notification !== 'undefined') {
        if (Notification.permission !== 'granted') {
          const result = await Notification.requestPermission();
          permOk = result === 'granted';
        } else {
          permOk = true;
        }
      } else {
        permOk = true;
      }

      if (!permOk) {
        set({ permissionGranted: false, isChecking: false, lastError: 'Notification permission denied' });
        console.warn('❌ [PushHealth] Permission denied');
        return false;
      }
      set({ permissionGranted: true });
      console.log('✅ [PushHealth] Permission granted');

      // Step 2: Re-register push to force fresh token
      if (Capacitor.isNativePlatform()) {
        console.log('🔄 [PushHealth] Re-registering push notifications...');
        await PushNotifications.register();

        // Wait for token to appear in native storage (Firebase may take a moment)
        let token: string | null = null;
        for (let i = 0; i < 10; i++) {
          await new Promise(r => setTimeout(r, 500));
          if (AuthBridge) {
            const result = await AuthBridge.getPendingFCMToken();
            token = result?.token ?? null;
            if (token) break;
          }
        }

        if (!token) {
          // Try getting from registration listener as fallback
          token = await new Promise<string | null>((resolve) => {
            const timeout = setTimeout(() => resolve(null), 5000);
            PushNotifications.addListener('registration', (t) => {
              clearTimeout(timeout);
              resolve(t.value);
            });
          });
        }

        if (!token) {
          set({ tokenExists: false, isChecking: false, lastError: 'Could not get FCM token' });
          console.error('❌ [PushHealth] No token after re-register');
          return false;
        }

        set({ tokenExists: true });
        console.log('✅ [PushHealth] Token obtained:', token.substring(0, 20) + '...');

        // Step 3: Sync to backend
        const synced = await syncTokenToBackend(token, userId);
        if (!synced) {
          set({ tokenSyncedToBackend: false, isChecking: false, lastError: 'Failed to sync token to backend' });
          return false;
        }

        // Clear pending token after successful sync
        try { await AuthBridge.clearPendingFCMToken(); } catch {}

        set({
          tokenSyncedToBackend: true,
          tokenHealthy: true,
          isChecking: false,
          lastCheckAt: new Date(),
        });

        console.log('✅ [PushHealth] Full repair successful');
        return true;
      } else {
        // Web: use web push service
        set({ isChecking: false, lastError: 'Web push repair not implemented' });
        return false;
      }
    } catch (e: any) {
      console.error('❌ [PushHealth] Repair failed:', e);
      set({ isChecking: false, lastError: e.message });
      return false;
    } finally {
      repairingRef.current = false;
    }
  }, [userId]);

  // Run check on mount, userId change, and app resume
  useEffect(() => {
    mountedRef.current = true;
    if (!userId) return;

    // Initial check with delay for auth to settle
    const timer = setTimeout(() => checkHealth(), 2000);

    // Periodic check every 3 minutes
    const interval = setInterval(() => checkHealth(), 3 * 60 * 1000);

    // Check on resume
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        console.log('🛡️ [PushHealth] App resumed, re-checking...');
        checkHealth();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      mountedRef.current = false;
      clearTimeout(timer);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [userId, checkHealth]);

  return { ...state, checkHealth, repair };
}

/**
 * Sync a token to the workers table and fcm_tokens fallback.
 */
async function syncTokenToBackend(token: string, userId: string): Promise<boolean> {
  try {
    const now = new Date().toISOString();

    const { error: workerError } = await supabase
      .from('workers')
      .update({
        fcm_token: token,
        fcm_token_status: 'active',
        fcm_token_updated_at: now,
        fcm_token_platform: Capacitor.isNativePlatform() ? 'android' : 'web',
        updated_at: now,
      })
      .eq('user_id', userId);

    if (workerError) {
      console.error('❌ [PushHealth] Backend sync failed:', workerError);
      return false;
    }

    // Legacy fallback
    await supabase.from('fcm_tokens').upsert(
      { user_id: userId, token, updated_at: now },
      { onConflict: 'user_id' }
    ).then(({ error }) => {
      if (error) console.warn('⚠️ [PushHealth] fcm_tokens fallback failed:', error);
    });

    console.log('✅ [PushHealth] Token synced to backend');
    return true;
  } catch (e) {
    console.error('❌ [PushHealth] Sync exception:', e);
    return false;
  }
}
