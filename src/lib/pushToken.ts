import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from '@/integrations/supabase/client';
import { CURRENT_VERSION_NAME } from '@/config/version';

// @ts-ignore - Capacitor bridge
const AuthBridge = (window as any).Capacitor?.Plugins?.AuthBridge;

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export interface PushHealthSnapshot {
  permissionGranted: boolean;
  localToken: string | null;
  backendToken: string | null;
  backendStatus: string | null;
  tokenExists: boolean;
  tokenSyncedToBackend: boolean;
  tokenHealthy: boolean;
  isHealthy: boolean;
}

export async function ensurePushPermission(reason: string, options?: { requestIfMissing?: boolean }): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      let permission = await PushNotifications.checkPermissions();
      console.log(`🔐 [PushToken] ${reason}: current permission =`, permission.receive);

      if (permission.receive !== 'granted' && options?.requestIfMissing === true) {
        console.log(`🔐 [PushToken] ${reason}: requesting notification permission...`);
        permission = await PushNotifications.requestPermissions();
        console.log(`🔐 [PushToken] ${reason}: permission result =`, permission.receive);
      }

      return permission.receive === 'granted';
    } catch (error) {
      console.warn(`⚠️ [PushToken] ${reason}: permission check failed`, error);
      return false;
    }
  }

  if (typeof Notification !== 'undefined') {
    if (Notification.permission !== 'granted' && options?.requestIfMissing === true) {
      const result = await Notification.requestPermission();
      return result === 'granted';
    }

    return true;
  }

  return true;
}

export async function getPendingNativeFcmToken(): Promise<string | null> {
  if (!Capacitor.isNativePlatform() || !AuthBridge) return null;

  try {
    const result = await AuthBridge.getPendingFCMToken();
    return result?.token ?? null;
  } catch (error) {
    console.warn('⚠️ [PushToken] Failed to read pending native token:', error);
    return null;
  }
}

export async function clearPendingNativeFcmToken(): Promise<void> {
  if (!Capacitor.isNativePlatform() || !AuthBridge) return;

  try {
    await AuthBridge.clearPendingFCMToken();
  } catch (error) {
    console.warn('⚠️ [PushToken] Failed to clear pending native token:', error);
  }
}

export async function waitForNativeFcmToken({
  reason,
  timeoutMs = 12000,
  pollMs = 500,
  registerIfNeeded = true,
}: {
  reason: string;
  timeoutMs?: number;
  pollMs?: number;
  registerIfNeeded?: boolean;
}): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;

  const existingToken = await getPendingNativeFcmToken();
  if (existingToken) {
    console.log(`✅ [PushToken] ${reason}: found pending token immediately`);
    return existingToken;
  }

  let tokenFromEvent: string | null = null;
  let registrationError: unknown = null;
  const registrationHandle = await PushNotifications.addListener('registration', (token) => {
    tokenFromEvent = token.value;
    console.log(`✅ [PushToken] ${reason}: registration event received`);
  });
  const errorHandle = await PushNotifications.addListener('registrationError', (error) => {
    registrationError = error;
    console.warn(`⚠️ [PushToken] ${reason}: registration error received`, error);
  });

  try {
    if (registerIfNeeded) {
      console.log(`📲 [PushToken] ${reason}: calling PushNotifications.register()`);
      await PushNotifications.register();
    }

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (tokenFromEvent) {
        return tokenFromEvent;
      }

      const pendingToken = await getPendingNativeFcmToken();
      if (pendingToken) {
        console.log(`✅ [PushToken] ${reason}: pending token found after register()`);
        return pendingToken;
      }

      await wait(pollMs);
    }

    if (registrationError) {
      console.warn(`⚠️ [PushToken] ${reason}: timed out after registration error`, registrationError);
    } else {
      console.warn(`⚠️ [PushToken] ${reason}: timed out waiting for token`);
    }

    return tokenFromEvent || await getPendingNativeFcmToken();
  } finally {
    await registrationHandle.remove();
    await errorHandle.remove();
  }
}

export async function syncTokenToBackend(token: string, userId: string, reason: string): Promise<boolean> {
  try {
    const { getWorkerId } = await import("@/lib/workerId");
    const workerId = await getWorkerId(userId);
    
    if (!workerId) {
      console.warn(`⚠️ [PushToken] ${reason}: no worker row found for user_id=${userId}`);
      return false;
    }

    const now = new Date().toISOString();

    const { error: workerError } = await supabase
      .from('workers')
      .update({
        fcm_token: token,
        fcm_token_status: 'active',
        fcm_token_updated_at: now,
        last_fcm_token_refresh_at: now,
        fcm_token_platform: Capacitor.isNativePlatform() ? 'android' : 'web',
        availability_state: 'ONLINE_HEALTHY',
        notification_health: 'good',
        no_ack_count: 0,
        notification_repair_failures: 0,
        fcm_last_fail_at: null,
        fcm_last_fail_reason: null,
        last_app_opened_at: now,
        app_version: CURRENT_VERSION_NAME,
        updated_at: now,
      })
      .eq('id', workerId);

    if (workerError) {
      console.error(`❌ [PushToken] ${reason}: workers sync failed`, workerError);
      return false;
    }

    const { error: fallbackError } = await supabase.from('fcm_tokens').upsert(
      { user_id: userId, token, updated_at: now },
      { onConflict: 'user_id' }
    );

    if (fallbackError) {
      console.warn(`⚠️ [PushToken] ${reason}: fcm_tokens fallback sync failed`, fallbackError);
    }

    console.log(`✅ [PushToken] ${reason}: backend sync successful for worker ${workerId}`);
    return true;
  } catch (error) {
    console.error(`❌ [PushToken] ${reason}: backend sync exception`, error);
    return false;
  }
}

export async function getPushHealthSnapshot(userId: string): Promise<PushHealthSnapshot> {
  const permissionGranted = await ensurePushPermission('health-check', { requestIfMissing: false });
  const localToken = await getPendingNativeFcmToken();

  const { getWorkerId } = await import("@/lib/workerId");
  const workerId = await getWorkerId(userId);

  if (!workerId) {
    return {
      permissionGranted,
      localToken,
      backendToken: null,
      backendStatus: null,
      tokenExists: !!localToken,
      tokenSyncedToBackend: false,
      tokenHealthy: false,
      isHealthy: false
    };
  }

  const { data: worker } = await supabase
    .from('workers')
    .select('fcm_token, fcm_token_status')
    .eq('id', workerId)
    .maybeSingle();

  const backendToken = worker?.fcm_token ?? null;
  const backendStatus = worker?.fcm_token_status ?? null;
  const tokenExists = !!(localToken || backendToken);
  const tokenSyncedToBackend = !!backendToken;
  const tokenHealthy = tokenSyncedToBackend && backendStatus !== 'invalid';

  return {
    permissionGranted,
    localToken,
    backendToken,
    backendStatus,
    tokenExists,
    tokenSyncedToBackend,
    tokenHealthy,
    isHealthy: permissionGranted && tokenExists && tokenSyncedToBackend && tokenHealthy,
  };
}

export async function performPushRepair(userId: string, reason: string, options?: { requestPermission?: boolean }): Promise<{
  success: boolean;
  error: string | null;
  token: string | null;
}> {
  try {
    const permissionGranted = await ensurePushPermission(reason, { requestIfMissing: options?.requestPermission === true });
    if (!permissionGranted) {
      console.warn(`❌ [PushToken] ${reason}: notification permission denied`);
      return { success: false, error: 'Notification permission denied', token: null };
    }

    if (!Capacitor.isNativePlatform()) {
      return { success: false, error: 'Web push repair not implemented', token: null };
    }

    const token = await waitForNativeFcmToken({ reason, timeoutMs: 12000, pollMs: 500, registerIfNeeded: true });

    if (!token) {
      console.error(`❌ [PushToken] ${reason}: no token received after register()`);
      return { success: false, error: 'Could not get FCM token', token: null };
    }

    console.log(`🎯 [PushToken] ${reason}: token fetched`, `${token.substring(0, 20)}...`);

    const synced = await syncTokenToBackend(token, userId, reason);
    if (!synced) {
      return { success: false, error: 'Failed to sync token to backend', token };
    }

    await clearPendingNativeFcmToken();
    return { success: true, error: null, token };
  } catch (error: any) {
    console.error(`❌ [PushToken] ${reason}: repair exception`, error);
    return { success: false, error: error?.message || 'Unexpected push repair error', token: null };
  }
}