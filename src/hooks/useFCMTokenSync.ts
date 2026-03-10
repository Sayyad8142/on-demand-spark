import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';

// @ts-ignore - Capacitor bridge
const AuthBridge = (window as any).Capacitor?.Plugins?.AuthBridge;

/**
 * useFCMTokenSync — Syncs any pending FCM token (saved natively by
 * MyFirebaseService.onNewToken()) to the backend when a user session
 * is available.
 *
 * Source of truth:
 *   PRIMARY  → workers.fcm_token  (used by send-fcm edge function first)
 *   FALLBACK → fcm_tokens table   (legacy, kept in sync for compatibility)
 *
 * This hook should be mounted once near the app root, receiving the
 * current userId. It runs on mount and whenever userId changes.
 */
export function useFCMTokenSync(userId: string | undefined) {
  const syncedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !AuthBridge || !userId) return;

    const syncToken = async () => {
      try {
        const result = await AuthBridge.getPendingFCMToken();
        const pendingToken: string | null = result?.token ?? null;

        if (!pendingToken) {
          // No pending token — nothing to sync
          return;
        }

        // Skip if we already synced this exact token in this session
        if (syncedRef.current === pendingToken) {
          return;
        }

        console.log(
          '🔄 [FCMSync] Found pending FCM token, syncing to backend...',
          pendingToken.substring(0, 20) + '...'
        );

        // Write to PRIMARY source: workers.fcm_token
        const { error: workerError } = await supabase
          .from('workers')
          .update({
            fcm_token: pendingToken,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId);

        if (workerError) {
          console.error('❌ [FCMSync] Failed to save token to workers:', workerError);
          // Don't clear pending — will retry on next mount
          return;
        }

        // Write to FALLBACK source: fcm_tokens table
        const { error: fcmError } = await supabase.from('fcm_tokens').upsert(
          { user_id: userId, token: pendingToken },
          { onConflict: 'user_id' }
        );

        if (fcmError) {
          console.warn('⚠️ [FCMSync] Failed to save token to fcm_tokens (non-critical):', fcmError);
          // Non-critical — workers table is primary
        }

        console.log('✅ [FCMSync] Token synced to backend successfully');
        syncedRef.current = pendingToken;

        // Clear the pending token from native storage
        await AuthBridge.clearPendingFCMToken();
      } catch (e) {
        console.error('❌ [FCMSync] Exception during token sync:', e);
      }
    };

    // Small delay to let auth fully settle
    const timer = setTimeout(syncToken, 2000);
    return () => clearTimeout(timer);
  }, [userId]);
}
