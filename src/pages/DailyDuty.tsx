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
        <h1 className="text-3xl font-bold text-slate-800">Good Morning 🌞</h1>
        <p className="text-slate-600 mt-2 text-base">
          Tap the button to start receiving today&rsquo;s bookings.
        </p>

        {streak > 1 && (
          <div className="inline-flex items-center gap-2 mt-4 px-4 py-1.5 rounded-full bg-white/70 shadow-sm border border-white">
            <span className="text-lg">🔥</span>
            <span className="text-sm font-semibold text-slate-700">
              {streak} Day Streak
            </span>
          </div>
        )}
      </div>

      {/* Door */}
      <div className="relative flex items-center justify-center my-6">
        <div
          className="relative"
          style={{
            width: 260,
            height: 360,
            perspective: '1000px',
          }}
        >
          {/* Door frame */}
          <div
            className="absolute inset-0 rounded-[28px]"
            style={{
              background: 'linear-gradient(180deg, #8b5a2b 0%, #6b4423 100%)',
              boxShadow: '0 20px 40px -10px rgba(80, 50, 20, 0.35), inset 0 -6px 0 rgba(0,0,0,0.15)',
            }}
          />
          {/* Door panel (animates open) */}
          <div
            className="absolute inset-2 rounded-[22px] transition-transform duration-700 ease-out origin-left"
            style={{
              background:
                'repeating-linear-gradient(90deg, #a87042 0px, #a87042 22px, #9a6438 22px, #9a6438 26px), linear-gradient(180deg, #b07a4a, #8a5a30)',
              transform: doorOpen ? 'rotateY(-55deg)' : 'rotateY(0deg)',
              boxShadow: 'inset 0 0 24px rgba(0,0,0,0.18)',
            }}
          >
            {/* Door knob */}
            <div
              className="absolute"
              style={{
                right: 18,
                top: '50%',
                width: 14,
                height: 14,
                borderRadius: 999,
                background: '#f1c40f',
                boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
              }}
            />

            {/* Center button */}
            <div className="absolute inset-0 flex items-center justify-center">
              {!activated ? (
                <button
                  onClick={handleStart}
                  disabled={submitting}
                  className="rounded-2xl font-bold text-white text-lg px-8 py-4 active:scale-95 transition-transform shadow-lg disabled:opacity-70"
                  style={{
                    background: 'linear-gradient(180deg, #22c55e 0%, #16a34a 100%)',
                    boxShadow: '0 8px 20px -6px rgba(22, 163, 74, 0.55), inset 0 -3px 0 rgba(0,0,0,0.15)',
                    minWidth: 180,
                  }}
                >
                  {submitting ? 'Starting…' : 'Get Bookings'}
                </button>
              ) : (
                <div className="text-center px-4">
                  <div className="text-white text-xl font-bold drop-shadow">
                    You are active today ✅
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom helper text */}
      <p className="text-center text-xs text-slate-600 max-w-xs pb-4">
        Open the app daily to stay active and receive bookings faster.
      </p>
    </div>
  );
}
