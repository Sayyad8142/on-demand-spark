import { useEffect, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';

// @ts-ignore - Capacitor bridge
const AuthBridge = (window as any).Capacitor?.Plugins?.AuthBridge;

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
 * Self-healing: if the backend has no active token for this worker,
 * the hook re-reads the native pending token and syncs it.
 */
export function useFCMTokenSync(userId: string | undefined) {
  const syncedRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const syncToken = useCallback(async (reason: string) => {
    if (!Capacitor.isNativePlatform() || !AuthBridge || !userId) return;

    try {
      const result = await AuthBridge.getPendingFCMToken();
      const pendingToken: string | null = result?.token ?? null;

      if (!pendingToken) {
        // No pending token from native side — check if backend already has one
        // If not, we can't do anything until Firebase issues a new token
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

      // Write to PRIMARY source: workers.fcm_token + health fields
      const { error: workerError, data: workerData } = await supabase
        .from('workers')
        .update({
          fcm_token: pendingToken,
          fcm_token_updated_at: new Date().toISOString(),
          fcm_token_status: 'active',
          fcm_token_platform: 'android',
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .select('id');

      if (workerError) {
        console.error('❌ [FCMSync] Failed to save token to workers:', workerError);
        return; // Don't clear pending — will retry
      }

      if (!workerData || workerData.length === 0) {
        console.warn('⚠️ [FCMSync] workers update matched 0 rows for userId:', userId);
      } else {
        console.log('✅ [FCMSync] Token saved to workers table, worker id:', workerData[0].id);
      }

      // Write to FALLBACK: fcm_tokens table (legacy compatibility)
      const { error: fcmError } = await supabase.from('fcm_tokens').upsert(
        { user_id: userId, token: pendingToken, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );

      if (fcmError) {
        console.warn('⚠️ [FCMSync] fcm_tokens fallback write failed (non-critical):', fcmError);
      }

      console.log('✅ [FCMSync] Token synced successfully');
      syncedRef.current = pendingToken;

      // Clear the pending token from native storage
      await AuthBridge.clearPendingFCMToken();
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

    // Initial sync with small delay for auth to settle
    const initTimer = setTimeout(() => syncToken('mount'), 2000);

    // Self-heal every 5 minutes
    const healInterval = setInterval(() => selfHealCheck(), 5 * 60 * 1000);

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
