/**
 * Daily Duty Start — lightweight client helpers.
 *
 * Purpose: ensure workers open the app daily and tap one button. This refreshes
 * heartbeat/FCM/health markers and improves dispatch freshness. NOT attendance.
 */
import { supabase } from '@/integrations/supabase/client';
import { Capacitor } from '@capacitor/core';

const LS_LAST_DUTY_DATE = 'didi_daily_duty_date';
const LS_STREAK = 'didi_daily_duty_streak';
const MIN_HOUR_LOCAL = 6; // do not gate before 6:00 AM local

/** YYYY-MM-DD in IST. */
export function istTodayString(d: Date = new Date()): string {
  // Convert to IST (UTC+5:30)
  const ist = new Date(d.getTime() + (5 * 60 + 30) * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

export function getCachedStreak(): number {
  const v = Number(localStorage.getItem(LS_STREAK) || '0');
  return Number.isFinite(v) ? v : 0;
}

export function getCachedDutyDate(): string | null {
  return localStorage.getItem(LS_LAST_DUTY_DATE);
}

/**
 * Should the duty screen be shown right now?
 * - Skip before 6:00 AM local (avoid waking night workers at 2 AM).
 * - Skip if already activated today (per IST).
 */
export function shouldShowDailyDuty(): boolean {
  try {
    const today = istTodayString();
    const last = getCachedDutyDate();
    if (last === today) return false;
    const hourLocal = new Date().getHours();
    if (hourLocal < MIN_HOUR_LOCAL) return false;
    return true;
  } catch {
    return false;
  }
}

export function markActivatedLocally(today: string, streak: number) {
  localStorage.setItem(LS_LAST_DUTY_DATE, today);
  localStorage.setItem(LS_STREAK, String(streak));
}

/**
 * Calls the server-side start_daily_duty RPC. Updates heartbeat/last_app_opened_at
 * and computes streak atomically.
 */
export async function startDailyDutyRPC(userId: string): Promise<{ streak: number } | null> {
  try {
    const { data, error } = await supabase.rpc('start_daily_duty', {
      _worker_user_id: userId,
    });
    if (error) {
      console.warn('[DAILY_DUTY_RPC_ERROR]', error.message);
      return null;
    }
    const row = Array.isArray(data) ? data[0] : data;
    const streak = Number((row as any)?.streak ?? 0) || 1;
    markActivatedLocally(istTodayString(), streak);
    return { streak };
  } catch (e: any) {
    console.warn('[DAILY_DUTY_RPC_EXCEPTION]', e?.message || e);
    return null;
  }
}

/**
 * Best-effort daily morning reminder via Capacitor LocalNotifications.
 * Schedules a notification for the next 6:45 AM local time. Safe no-op on web.
 */
export async function scheduleMorningReminder(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') {
      const req = await LocalNotifications.requestPermissions();
      if (req.display !== 'granted') {
        console.log('[DAILY_DUTY_REMINDER_PERM_DENIED]');
        return;
      }
    }

    const now = new Date();
    const next = new Date();
    next.setHours(6, 45, 0, 0);
    if (next.getTime() <= now.getTime()) {
      next.setDate(next.getDate() + 1);
    }

    // Cancel previous reminder, then schedule fresh
    try {
      await LocalNotifications.cancel({ notifications: [{ id: 9001 }] });
    } catch {}

    await LocalNotifications.schedule({
      notifications: [
        {
          id: 9001,
          title: 'Your Didi Now duty starts soon',
          body: 'Open the app and tap Get Bookings to receive today\u2019s bookings.',
          schedule: { at: next, repeats: true, every: 'day' },
          smallIcon: 'ic_notification',
        },
      ],
    });
    console.log('[DAILY_DUTY_REMINDER_SCHEDULED]', next.toISOString());
  } catch (e: any) {
    console.warn('[DAILY_DUTY_REMINDER_ERROR]', e?.message || e);
  }
}
