import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { startDailyDutyRPC, getCachedStreak, markActivatedLocally, istTodayString } from '@/lib/dailyDuty';
import { syncTokenToBackend } from '@/lib/pushToken';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

/**
 * Daily Duty Start Screen — one-tap daily activation.
 * Refreshes heartbeat, FCM token, and dispatch freshness markers.
 */
export default function DailyDuty() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [activated, setActivated] = useState(false);
  const [streak, setStreak] = useState<number>(getCachedStreak());
  const [doorOpen, setDoorOpen] = useState(false);

  // Defensive: if no user, bounce home.
  useEffect(() => {
    if (!user?.id) {
      const t = setTimeout(() => navigate('/home', { replace: true }), 300);
      return () => clearTimeout(t);
    }
  }, [user?.id, navigate]);

  const handleStart = async () => {
    if (submitting || !user?.id) return;
    setSubmitting(true);
    setDoorOpen(true);
    console.log('[DAILY_DUTY_START_TAP]');

    // 1. Server-side: update last_app_opened_at, heartbeat, streak
    const res = await startDailyDutyRPC(user.id);
    const newStreak = res?.streak ?? Math.max(streak + 1, 1);
    setStreak(newStreak);
    markActivatedLocally(istTodayString(), newStreak);

    // 2. Best-effort: refresh FCM token health
    try {
      if (Capacitor.isNativePlatform()) {
        await PushNotifications.register().catch(() => {});
        // syncTokenToBackend gets called by registration listener; also do a
        // direct token-health ping if a token is already known via storage.
        const cached = localStorage.getItem('didi_last_fcm_token');
        if (cached) {
          await syncTokenToBackend(cached, user.id, 'daily-duty-start').catch(() => {});
        }
      }
    } catch (e) {
      console.warn('[DAILY_DUTY_FCM_REFRESH_WARN]', e);
    }

    setActivated(true);
    console.log('[DAILY_DUTY_ACTIVATED]', { streak: newStreak });

    // 3. Navigate after short success animation
    setTimeout(() => navigate('/home', { replace: true }), 1100);
  };

  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-between px-6 py-10"
      style={{
        background: 'linear-gradient(180deg, #e6f3ff 0%, #cfe7ff 60%, #b9dcff 100%)',
      }}
    >
      {/* Top content */}
      <div className="w-full text-center mt-4">
        

        {streak > 1 && (
          <div className="inline-flex items-center gap-2 mt-4 px-4 py-1.5 rounded-full bg-white/70 shadow-sm border border-white">
            <span className="text-lg">🔥</span>
            <span className="text-sm font-semibold text-slate-700">
              {streak} Day Streak
            </span>
          </div>
        )}
      </div>

      {/* Get Bookings Button */}
      <div className="flex flex-col items-center justify-center my-6">
        {!activated ? (
          <button
            onClick={handleStart}
            disabled={submitting}
            className="rounded-2xl font-bold text-white text-lg px-8 py-4 active:scale-95 transition-transform shadow-lg disabled:opacity-70"
            style={{
              background: 'linear-gradient(180deg, #22c55e 0%, #16a34a 100%)',
              boxShadow: '0 8px 20px -6px rgba(22, 163, 74, 0.55), inset 0 -3px 0 rgba(0,0,0,0.15)',
              minWidth: 220,
            }}
          >
            {submitting ? 'Starting…' : 'Get Bookings'}
          </button>
        ) : (
          <div className="text-center px-4">
            <div className="text-slate-800 text-xl font-bold drop-shadow">
              You are active today ✅
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
