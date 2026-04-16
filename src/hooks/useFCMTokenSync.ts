import { useEffect, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { clearPendingNativeFcmToken, syncTokenToBackend, waitForNativeFcmToken } from '@/lib/pushToken';

/**
 * useFCMTokenSync — Robust FCM token lifecycle manager.
 *
 * Architecture:  workers.fcm_token  is the SOLE source of truth.
 *   - fcm_tokens table is kept in sync as legacy fallback but workers table
 *     is what dispatch + send-fcm read first.
 *
 * Token registration triggers:
 *   1. On mount (app start / login)
 *   2. On userId change (login after logout)
 *   3. On app resume (via visibility change)
 *   4. Periodic self-heal every 5 minutes
 *
 * Enhanced: if no pending token exists, force PushNotifications.register()
 * to trigger a fresh token from Firebase.
 */
export function useFCMTokenSync(userId: string | undefined) {
  const syncedRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const syncToken = useCallback(async (reason: string) => {
    if (!Capacitor.isNativePlatform() || !userId) return;

    try {
      console.log(`🔄 [FCMSync] ${reason}: checking pending native token`);
      let pendingToken = await waitForNativeFcmToken({
        reason: `fcm-sync-${reason}-pending-check`,
        timeoutMs: 1500,
        pollMs: 250,
        registerIfNeeded: false,
      });

      // If no pending token, force re-register to get a fresh one
      if (!pendingToken) {
        console.log(`🔄 [FCMSync] ${reason}: no pending token, forcing register()`);
        pendingToken = await waitForNativeFcmToken({
          reason: `fcm-sync-${reason}-register`,
          timeoutMs: 12000,
          pollMs: 500,
          registerIfNeeded: true,
        });
      }

      if (!pendingToken) {
        console.warn(`⚠️ [FCMSync] ${reason}: token still unavailable after register()`);
        return;
      }

      // Skip if we already synced this exact token in this session
      if (syncedRef.current === pendingToken) {
        return;
      }

      console.log(
        `🔄 [FCMSync] Syncing token (${reason}):`,
        pendingToken.substring(0, 20) + '...'
      );

      const synced = await syncTokenToBackend(pendingToken, userId, `fcm-sync-${reason}`);
      if (!synced) {
        console.error('❌ [FCMSync] Failed to sync token to backend');
        return; // Don't clear pending — will retry
      }

      console.log('✅ [FCMSync] Token synced successfully');
      syncedRef.current = pendingToken;

      // Clear the pending token from native storage
      await clearPendingNativeFcmToken();
    } catch (e) {
      console.error('❌ [FCMSync] Exception during token sync:', e);
    }
  }, [userId]);

  // Self-heal check: verify backend has a valid token for this worker
  const selfHealCheck = useCallback(async () => {
    if (!userId) return;

    try {
      const { data: workerData } = await supabase
        .from('workers')
        .select('fcm_token, fcm_token_status')
        .eq('user_id', userId)
        .maybeSingle();

      if (!workerData) return;

      const tokenMissing = !workerData.fcm_token;
      const tokenInvalid = workerData.fcm_token_status === 'invalid';

      if (tokenMissing || tokenInvalid) {
        console.warn(`⚠️ [FCMSync] Self-heal: token ${tokenMissing ? 'missing' : 'invalid'} on backend, re-syncing...`);
        // Reset syncedRef so we force a re-sync even if we previously synced this token
        syncedRef.current = null;
        await syncToken('self-heal');
      }
    } catch (e) {
      console.warn('⚠️ [FCMSync] Self-heal check failed:', e);
    }
  }, [userId, syncToken]);

  useEffect(() => {
    mountedRef.current = true;

    if (!userId) return;

    // Initial sync immediately (no delay for new workers)
    const initTimer = setTimeout(() => syncToken('mount'), 500);

    // Self-heal every 3 minutes (more aggressive for new workers)
    const healInterval = setInterval(() => selfHealCheck(), 3 * 60 * 1000);

    // Re-sync on app resume (visibility change)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        console.log('🔄 [FCMSync] App resumed, checking token...');
        syncToken('resume');
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      mountedRef.current = false;
      clearTimeout(initTimer);
      clearInterval(healInterval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [userId, syncToken, selfHealCheck]);

  // Reset synced token when user changes (logout/login)
  useEffect(() => {
    syncedRef.current = null;
  }, [userId]);
}
