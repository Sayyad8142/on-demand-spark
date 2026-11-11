import { Capacitor, registerPlugin } from '@capacitor/core';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

// Keep OFF until the isolated sender has been approved and deployed.
export const PRACTICE_PUSH_ENABLED = false;
export interface PracticeDeviceState { id: string; received: boolean; overlay: boolean; outcome?: string; reason?: string; }
interface PracticePlugin {
  prepare(options: { id: string; expiresAt: number }): Promise<{ ready: boolean; reason?: string }>;
  getState(): Promise<PracticeDeviceState>;
  cancel(): Promise<void>;
}
export const PracticeNotifications = registerPlugin<PracticePlugin>('PracticeNotifications');
export type PracticePushFailure = 'approval' | 'android' | 'token_missing' | 'token_invalid' | 'offline' | 'permission' | 'busy' | 'native_missing';
export async function sendPracticePush(input: { id: string; expiresAt: number; tokenStatus: string | null; hasToken: boolean }): Promise<{ sent: true } | { sent: false; reason: PracticePushFailure; details?: string }> {
  if (!PRACTICE_PUSH_ENABLED) return { sent: false, reason: 'approval' };
  if (Capacitor.getPlatform() !== 'android') return { sent: false, reason: 'android' };
  if (!navigator.onLine) return { sent: false, reason: 'offline' };
  if (!input.hasToken) return { sent: false, reason: 'token_missing' };
  if (input.tokenStatus !== 'active') return { sent: false, reason: 'token_invalid' };
  try {
    const ready = await PracticeNotifications.prepare({ id: input.id, expiresAt: input.expiresAt });
    if (!ready.ready) return { sent: false, reason: ready.reason === 'busy' ? 'busy' : 'permission' };
  } catch { return { sent: false, reason: 'native_missing' }; }
  const { data, error } = await supabase.functions.invoke('send-practice-notification', { body: { practice_id: input.id, expires_at: input.expiresAt } });
  if (error) {
    const details = error instanceof FunctionsHttpError ? await error.context.text() : error.message;
    // Return the actual sender failure; never fall back to a fake received event.
    await PracticeNotifications.cancel().catch(() => undefined);
    throw new Error(details);
  }
  if (data?.sent !== true || data?.practice_id !== input.id) throw new Error('Practice notification send was not confirmed');
  return { sent: true };
}