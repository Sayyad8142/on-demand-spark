import { useEffect, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import {
  clearPendingNativeFcmToken,
  ensurePushPermission,
  syncTokenToBackend,
  waitForNativeFcmToken,
} from '@/lib/pushToken';

const STALE_TOKEN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * useFCMTokenSync — Robust FCM token lifecycle manager.
 *
 * Triggers a forced refresh on:
 *   - cold start / login (mount)
 *   - app resume (visibilitychange)
 *   - missing token, invalid status, null platform, OR fcm_token_updated_at older than 7 days
 *
 * Self-heal interval re-checks every 3 minutes.
 */
export function useFCMTokenSync(userId: string | undefined) {
  const syncedRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const evaluateBackendFreshness = useCallback(async (reason: string): Promise<{ needsRefresh: boolean; why: string }> => {
    if (!userId) return { needsRefresh: false, why: 'no-user' };

    const { data: worker, error } = await supabase
      .from('workers')
      .select('id, fcm_token, fcm_token_status, fcm_token_platform, fcm_token_updated_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.warn(`⚠️ [FCMSync] ${reason}: backend fetch failed`, error);
      return { needsRefresh: true, why: 'backend-fetch-error' };
    }
    if (!worker) {
      return { needsRefresh: true, why: 'no-worker-row' };
    }

    if (!worker.fcm_token) return { needsRefresh: true, why: 'token-missing' };
    if (worker.fcm_token_status === 'invalid') return { needsRefresh: true, why: 'token-invalid' };
    if (!worker.fcm_token_platform) return { needsRefresh: true, why: 'platform-null' };

    if (worker.fcm_token_updated_at) {
      const ageMs = Date.now() - new Date(worker.fcm_token_updated_at).getTime();
      if (ageMs > STALE_TOKEN_MS) {
        return { needsRefresh: true, why: `stale-${Math.round(ageMs / (24 * 60 * 60 * 1000))}d` };
      }
    } else {
      return { needsRefresh: true, why: 'updated-at-null' };
    }

    return { needsRefresh: false, why: 'healthy' };
  }, [userId]);

  const refreshToken = useCallback(async (reason: string, opts?: { force?: boolean }) => {
    if (!Capacitor.isNativePlatform() || !userId) return;

    try {
      console.log(`🔄 [FCMSync] ${reason}: token refresh started (force=${!!opts?.force}) for worker user_id=${userId}`);

      // Check freshness unless force=true
      if (!opts?.force) {
        const { needsRefresh, why } = await evaluateBackendFreshness(reason);
        if (!needsRefresh) {
          console.log(`✅ [FCMSync] ${reason}: backend token is healthy (${why}), skipping refresh`);
          return;
        }
        console.log(`⚠️ [FCMSync] ${reason}: refresh required — reason=${why}`);
      }

      // 1. Permission
      const permissionGranted = await ensurePushPermission(`fcm-sync-${reason}`, { requestIfMissing: true });
      console.log(`🔐 [FCMSync] ${reason}: permission status = ${permissionGranted ? 'granted' : 'denied'}`);
      if (!permissionGranted) {
        console.warn(`❌ [FCMSync] ${reason}: cannot refresh — notification permission denied`);
        return;
      }

      // 2. Get fresh native FCM token (force register)
      const token = await waitForNativeFcmToken({
        reason: `fcm-sync-${reason}`,
        timeoutMs: 12000,
        pollMs: 500,
        registerIfNeeded: true,
      });

      if (!token) {
        console.warn(`⚠️ [FCMSync] ${reason}: no native token returned after register()`);
        return;
      }

      // 3. Skip if same token already synced this session AND not forced
      if (!opts?.force && syncedRef.current === token) {
        console.log(`ℹ️ [FCMSync] ${reason}: token unchanged from last sync, skipping write`);
        return;
      }

      console.log(`🔄 [FCMSync] ${reason}: syncing token ${token.substring(0, 20)}... to backend`);

      // 4. Save to backend (workers.fcm_token + status + platform + updated_at)
      const synced = await syncTokenToBackend(token, userId, `fcm-sync-${reason}`);
      if (!synced) {
        console.error(`❌ [FCMSync] ${reason}: failed to sync token to backend`);
        return;
      }

      console.log(`✅ [FCMSync] ${reason}: token saved successfully for worker user_id=${userId}`);
      syncedRef.current = token;

      await clearPendingNativeFcmToken();
    } catch (e) {
      console.error(`❌ [FCMSync] ${reason}: exception during token refresh`, e);
    }
  }, [userId, evaluateBackendFreshness]);

  useEffect(() => {
    mountedRef.current = true;
    if (!userId) return;

    // Cold start / login → force refresh evaluation immediately
    const initTimer = setTimeout(() => refreshToken('mount'), 500);

    // Periodic self-heal every 3 minutes
    const healInterval = setInterval(() => refreshToken('self-heal'), 3 * 60 * 1000);

    // Re-check on app resume
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        console.log('🔄 [FCMSync] app resumed, evaluating token freshness');
        refreshToken('resume');
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      mountedRef.current = false;
      clearTimeout(initTimer);
      clearInterval(healInterval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [userId, refreshToken]);

  // Reset session-cached token on userId change (logout/login)
  useEffect(() => {
    syncedRef.current = null;
  }, [userId]);
}
