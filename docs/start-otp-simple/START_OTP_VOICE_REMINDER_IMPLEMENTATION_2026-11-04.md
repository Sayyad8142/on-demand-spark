# Start OTP Voice Reminder — Implementation (test env) 2026-11-04

Nothing published. No production backend change. No new Android build made (no SDK in sandbox).

## Built (Worker App, SOURCE)
- `android/app/src/main/res/raw/start_otp_voice.mp3` — female en-IN voice "OTP! OTP! OTP!" (3.5 s, loudness-normalised, 42 KB). Plays as the notification channel sound, so it follows volume, silent mode and DND.
- `src/lib/startOtpReminder.ts` — pure rules: reminders at 10,15,…,120 min after `accepted_at` (fallback `assigned_at`), 23 max; eligible only if worker owns the booking, `start_otp_required`, no server `started_at`, status assigned/accepted/on_the_way. Stable notification IDs per booking+index (no duplicates). Card indicator and proposed admin flag levels.
- `src/components/StartOtpReminderManager.tsx` — Android only. Schedules local notifications (`allowWhileIdle`, channel `start_otp_reminder_v1`, high importance) and cancels them on: server `started_at`, cancel, reassign, completion, logout. Re-syncs on app open/resume, every 60 s, booking realtime changes, accept/cancel events. Offline/error → schedule kept as is. Tap → `/start-booking/:id`.
- Booking card: "Start OTP Pending" → "Start OTP Delayed — Enter OTP" after 10 min (en/hi/te).
- Complete OTP reminder (60 min / 10 min) unchanged. No OTP, dispatch, payment or availability logic touched.
- Tests: `src/lib/__tests__/startOtpReminder.test.ts` (12). Suite 275/275.

## Recovery
- Phone restart: the Capacitor Local Notifications plugin restores scheduled alarms on boot by itself — no app open needed.
- App killed / swiped: alarms still fire.
- App reopen: re-sync fixes any drift.
- Force-stop from Settings: Android deletes all alarms; they come back only when the worker opens the app.
- Battery saver / Doze: inexact alarms may arrive a few minutes late (no exact-alarm permission requested).
- Notifications denied or channel muted: no sound; the card indicator still shows in-app.

## KNOWN LIMITATION — stale reminder while app is closed
If the OTP is verified while the app is closed/frozen (normally impossible since the worker enters it in the app, but possible if the app is killed right after, or the backend verifies another way), alarms already on the phone can still play until the app next opens. In normal use the worker verifies inside the app, which cancels within seconds via realtime/poll.

### Proposed server-side fix (PROPOSED, NOT BUILT — needs approval + native build)
1. DB trigger on `bookings` when `started_at` becomes non-null, or status leaves assigned/accepted/on_the_way, or `worker_id` changes → send a data-only FCM `{type:"start_otp_reminder_cancel", booking_id}` to the (old) worker.
2. Native `MyFirebaseMessagingService`: on that type, cancel the 23 alarm IDs (same formula as `reminderNotificationId`) via the plugin's PendingIntent (`TimedNotificationPublisher`, request code = id) and remove them from the plugin store so boot restore doesn't bring them back. Data-only high-priority FCM wakes the service even when the app is killed (not after force-stop).

## Admin flags (PROPOSED, NOT DEPLOYED)
Server cron every minute (mirrors `adminFlagLevel`):
- 20 min after acceptance, Start OTP not verified → `start_otp_flag = 'follow_up'`.
- 120 min → `start_otp_flag = 'urgent'`.
- Cleared on start/cancel/complete/reassign. Never cancels or penalises the worker. Admin Panel shows a badge. Columns + cron need a separate approved migration.

## Phone test plan (NOT RUN — needs a debug build on a real phone)
Open / background / locked / killed / restarted / battery saver / offline / notifications off / verify before 10 min / verify at 12 min / cancel and reassign mid-reminder / two bookings — check no duplicate sounds and tap opens the right booking.
