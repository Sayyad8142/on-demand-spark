import { Capacitor, registerPlugin } from '@capacitor/core';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

// Keep OFF until the isolated sender has been approved, deployed and device-tested.
export const PRACTICE_PUSH_ENABLED = false;
export interface PracticeDeviceState { id: string; received: boolean; overlay: boolean; outcome?: string; reason?: string; userId?: string; acceptedAt?: number; }
interface PracticePlugin {
  prepare(options: { id: string; expiresAt: number; userId: string }): Promise<{ ready: boolean; reason?: string; tokenSha256?: string }>;
  getState(): Promise<PracticeDeviceState>;
  cancel(): Promise<void>;
}
export const PracticeNotifications = registerPlugin<PracticePlugin>('PracticeNotifications');
export type PracticePushFailure = 'approval' | 'android' | 'token_missing' | 'token_invalid' | 'offline' | 'permission' | 'busy' | 'native_missing'
  | 'rate_limited' | 'login_required' | 'account_mismatch' | 'device_mismatch' | 'attempt_in_progress' | 'delivery_unknown' | 'sendError';

/** Server refusal reasons (staged sender contract) → display keys. Unknown → generic. */
export function practiceFailureFromServer(reason: unknown): PracticePushFailure {
  switch (reason) {
    case 'rate_limited': return 'rate_limited';
    case 'approval_required': return 'approval';
    case 'login_required': return 'login_required';
    case 'token_missing': return 'token_missing';
    case 'token_invalid': return 'token_invalid';
    case 'android_required': return 'android';
    case 'device_mismatch': case 'device_changed': return 'device_mismatch';
    case 'real_work_active': case 'safety_check_unavailable': return 'busy';
    case 'already_attempted': case 'attempt_in_progress': return 'attempt_in_progress';
    case 'delivery_unknown': case 'provider_unconfirmed': return 'delivery_unknown';
    case 'validated_only': return 'approval';
    default: return 'sendError';
  }
}

export async function sendPracticePush(input: { id: string; expiresAt: number; userId: string | null | undefined; tokenStatus: string | null; hasToken: boolean }, enabled = PRACTICE_PUSH_ENABLED): Promise<{ sent: true } | { sent: false; reason: PracticePushFailure }> {
  if (!enabled) return { sent: false, reason: 'approval' };
  if (Capacitor.getPlatform() !== 'android') return { sent: false, reason: 'android' };
  if (!input.userId) return { sent: false, reason: 'login_required' };
  if (!navigator.onLine) return { sent: false, reason: 'offline' };
  if (!input.hasToken) return { sent: false, reason: 'token_missing' };
  if (input.tokenStatus !== 'active') return { sent: false, reason: 'token_invalid' };
  let tokenSha256: string | undefined;
  try {
    const ready = await PracticeNotifications.prepare({ id: input.id, expiresAt: input.expiresAt, userId: input.userId });
    if (!ready.ready) {
      const r = ready.reason;
      return { sent: false, reason: r === 'busy' ? 'busy' : r === 'account_mismatch' ? 'account_mismatch' : r === 'token_missing' ? 'token_missing' : 'permission' };
    }
    tokenSha256 = ready.tokenSha256;
  } catch { return { sent: false, reason: 'native_missing' }; }
  if (!tokenSha256 || !/^[0-9a-f]{64}$/.test(tokenSha256)) {
    await PracticeNotifications.cancel().catch(() => undefined);
    return { sent: false, reason: 'native_missing' };
  }
  // Only these three fields: the server derives worker and device from the login.
  let reply;
  try { reply = await supabase.functions.invoke('send-practice-notification', {
    body: { practice_id: input.id, expires_at: input.expiresAt, device_token_sha256: tokenSha256 },
  }); } catch { return { sent: false, reason: 'delivery_unknown' }; }
  const { data, error } = reply;
  if (error) {
    let reason: unknown;
    if (error instanceof FunctionsHttpError) {
      try { reason = JSON.parse(await error.context.text())?.reason; } catch { reason = undefined; }
    }
    const failure = error instanceof FunctionsHttpError ? practiceFailureFromServer(reason) : 'delivery_unknown';
    // An uncertain attempt may still arrive; keep the native session so receipt can be matched.
    if (failure !== 'delivery_unknown') await PracticeNotifications.cancel().catch(() => undefined);
    return { sent: false, reason: failure };
  }
  if (data?.sent !== true || data?.practice_id !== input.id) {
    // A malformed reply does not prove the provider did not accept the message.
    return { sent: false, reason: 'delivery_unknown' };
  }
  return { sent: true };
}

/** Accepted on the native alert while the app was closed → restore that practice. */
export function shouldRestorePractice(state: PracticeDeviceState | null, userId: string | null | undefined, now: number): boolean {
  if (!state || !userId || state.outcome !== 'accepted' || !state.id?.startsWith('practice-')) return false;
  if (state.userId !== userId) return false;
  return typeof state.acceptedAt === 'number' && now - state.acceptedAt >= 0 && now - state.acceptedAt <= 10 * 60 * 1000;
}

/** On page open, only a finished native session (it has an outcome) may be consumed/cleared.
 * A session without an outcome is a send waiting for its push and must be left alone. */
export function shouldClearRestoredSession(state: PracticeDeviceState | null): boolean {
  return !!state && typeof state.id === 'string' && state.id.startsWith('practice-') && typeof state.outcome === 'string' && state.outcome.length > 0;
}

/** Clears any native practice session; safe to call on logout or account switch. */
export async function clearPracticeSession(): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;
  try { await PracticeNotifications.cancel(); } catch { /* older app without plugin */ }
}
