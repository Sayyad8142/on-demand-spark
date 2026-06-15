import { getPushHealthSnapshot, performPushRepair } from '@/lib/pushToken';
import { supabase } from '@/integrations/supabase/client';

async function recordRepairFailure(userId: string) {
  try {
    const { data } = await supabase
      .from('workers')
      .select('notification_repair_failures')
      .or(`user_id.eq.${userId},id.eq.${userId}`)
      .maybeSingle();
    const next = (data?.notification_repair_failures ?? 0) + 1;
    await supabase
      .from('workers')
      .update({ notification_repair_failures: next })
      .or(`user_id.eq.${userId},id.eq.${userId}`);
    console.warn(`📈 [PushRepair] notification_repair_failures incremented to ${next}`);
  } catch (e) {
    console.warn('[PushRepair] failed to record repair failure', e);
  }
}

export type PushRepairPhase = 'idle' | 'checking' | 'preparing' | 'success' | 'failed';

export interface PushRepairStatus {
  phase: PushRepairPhase;
  attempt: number;
  maxAttempts: number;
  lastError: string | null;
  source: string | null;
  manualRequired: boolean;
  updatedAt: number;
}

const RETRY_DELAYS_MS = [0, 2000, 5000, 10000];
const STATUS_EVENT = 'push-repair-status';

let currentStatus: PushRepairStatus = {
  phase: 'idle',
  attempt: 0,
  maxAttempts: RETRY_DELAYS_MS.length,
  lastError: null,
  source: null,
  manualRequired: false,
  updatedAt: Date.now(),
};

let activeRepairPromise: Promise<boolean> | null = null;

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function emitStatus(patch: Partial<PushRepairStatus>) {
  currentStatus = {
    ...currentStatus,
    ...patch,
    updatedAt: Date.now(),
  };

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<PushRepairStatus>(STATUS_EVENT, { detail: currentStatus }));
  }
}

function isNonRetriableError(error: string | null) {
  return error === 'Notification permission denied' || error === 'Web push repair not implemented';
}

export function getPushRepairStatus() {
  return currentStatus;
}

export function subscribePushRepairStatus(listener: (status: PushRepairStatus) => void) {
  if (typeof window === 'undefined') return () => undefined;

  const handler = (event: Event) => {
    listener((event as CustomEvent<PushRepairStatus>).detail);
  };

  window.addEventListener(STATUS_EVENT, handler as EventListener);
  listener(currentStatus);

  return () => {
    window.removeEventListener(STATUS_EVENT, handler as EventListener);
  };
}

export async function triggerAutomaticPushRepair(
  userId: string | undefined,
  source: string,
  retryDelaysMs = RETRY_DELAYS_MS,
  options?: { requestPermission?: boolean },
) {
  if (!userId) return false;

  if (activeRepairPromise) {
    console.log(`♻️ [PushRepair] ${source}: repair already in progress, reusing existing run`);
    return activeRepairPromise;
  }

  activeRepairPromise = (async () => {
    console.log(`🚀 [PushRepair] ${source}: auto repair started`);
    emitStatus({
      phase: 'checking',
      attempt: 0,
      maxAttempts: retryDelaysMs.length,
      lastError: null,
      source,
      manualRequired: false,
    });

    try {
      const health = await getPushHealthSnapshot(userId);
      console.log(
        `🩺 [PushRepair] ${source}: health perm=${health.permissionGranted} token=${health.tokenExists} synced=${health.tokenSyncedToBackend} healthy=${health.tokenHealthy}`
      );

      if (health.isHealthy) {
        console.log(`✅ [PushRepair] ${source}: push already healthy`);
        emitStatus({
          phase: 'success',
          attempt: 0,
          maxAttempts: retryDelaysMs.length,
          lastError: null,
          source,
          manualRequired: false,
        });
        return true;
      }

      let lastError: string | null = null;

      for (let index = 0; index < retryDelaysMs.length; index += 1) {
        const delayMs = retryDelaysMs[index];
        const attempt = index + 1;

        if (delayMs > 0) {
          console.log(`⏳ [PushRepair] ${source}: waiting ${delayMs}ms before retry ${attempt}`);
          await wait(delayMs);
        }

        emitStatus({
          phase: 'preparing',
          attempt,
          maxAttempts: retryDelaysMs.length,
          lastError: null,
          source,
          manualRequired: false,
        });

        console.log(`🔁 [PushRepair] ${source}: attempt ${attempt}/${retryDelaysMs.length}`);
        const result = await performPushRepair(userId, `${source}-attempt-${attempt}`, {
          requestPermission: options?.requestPermission === true,
        });

        if (result.success) {
          console.log(`✅ [PushRepair] ${source}: repair succeeded on attempt ${attempt}`);
          emitStatus({
            phase: 'success',
            attempt,
            maxAttempts: retryDelaysMs.length,
            lastError: null,
            source,
            manualRequired: false,
          });
          return true;
        }

        lastError = result.error;
        console.warn(`⚠️ [PushRepair] ${source}: attempt ${attempt} failed`, lastError);

        if (isNonRetriableError(lastError)) {
          break;
        }
      }

      console.error(`❌ [PushRepair] ${source}: automatic repair failed after retries`);
      emitStatus({
        phase: 'failed',
        attempt: retryDelaysMs.length,
        maxAttempts: retryDelaysMs.length,
        lastError: lastError ?? 'Automatic push repair failed',
        source,
        manualRequired: true,
      });
      return false;
    } catch (error: any) {
      const message = error?.message || 'Unexpected automatic push repair error';
      console.error(`❌ [PushRepair] ${source}: unexpected failure`, error);
      emitStatus({
        phase: 'failed',
        attempt: retryDelaysMs.length,
        maxAttempts: retryDelaysMs.length,
        lastError: message,
        source,
        manualRequired: true,
      });
      return false;
    } finally {
      activeRepairPromise = null;
    }
  })();

  return activeRepairPromise;
}

export async function triggerManualPushRepair(userId: string | undefined, source = 'manual-refresh') {
  return triggerAutomaticPushRepair(userId, source, RETRY_DELAYS_MS, { requestPermission: true });
}