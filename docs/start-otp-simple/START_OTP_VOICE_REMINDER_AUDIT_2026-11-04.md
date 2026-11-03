# Start OTP Voice Reminder — Audit + Proposal (2026-11-04)

Status: AUDIT ONLY. Nothing built, published or changed.

## What exists today (SOURCE)
- `src/hooks/useOtpReminderEscalation.ts`: an **End/Complete OTP** reminder. First alert 60 min after `accepted_at`, repeats every 10 min, stops on `otp_verified_at`. Pure JS polling (30 s) inside the open app — does NOT fire when app is killed/background-throttled/locked reliably.
- Active statuses it watches include `started`/`in_progress` — so it is unrelated to Start OTP.
- `src/lib/otpReminderVoice.ts`: speaks "OTP, OTP, please enter OTP." x3 via native `CancellationVoice` (Android TextToSpeech) or Web Speech. Singleton (no overlap).
- `@capacitor/local-notifications@7` is installed. `res/raw` has `booking_cancellation_voice.mp3`, `new_loud_ringtone.mp3`. No bundled "OTP OTP OTP" audio.
- Start OTP authority: server field `bookings.started_at` (set only by `verify_start_otp`) + per-booking `start_otp_required`.

## Android limitations
1. JS timers stop when the app is killed or Doze throttles it — cannot be the only mechanism.
2. A scheduled local notification can play a **bundled sound file** (channel sound) while locked/killed. It cannot run TextToSpeech without app code waking up → use a pre-recorded "OTP! OTP! OTP!" mp3 as the channel sound.
3. Channel sound respects DND/silent/volume (as required). Exact alarms need `SCHEDULE_EXACT_ALARM`; without it Android may delay up to ~10 min in Doze. Proposal: inexact (`allowWhileIdle`) — no new permission.
4. A phone-scheduled notification can't know the OTP was verified while the app is dead. Mitigation: cancel all on verify/cancel/reassign when app runs, and the server FCM path can't cancel local alarms. Residual risk: a stale reminder may fire once after verification if the app was killed. Optional fix needs a backend FCM "cancel" message (handoff, not built).
5. Reboot clears scheduled local notifications; they're re-scheduled on next app open (existing BootReceiver is not touched).

## Proposed safest implementation (needs GO)
- New pure rules `src/lib/startOtpReminder.ts`: eligible = `start_otp_required && !started_at && worker_id = me && status in (accepted, assigned, on_the_way)`; schedule = accepted_at+10, +15, +20 … (cap at e.g. 24 reminders / 2 h); deterministic notification IDs per booking → no duplicates.
- Hook `useStartOtpReminders`: on app start/resume/realtime booking change, cancel+reschedule local notifications on a dedicated channel `start_otp_reminder` (sound = new bundled `start_otp_voice.mp3`, high importance). In foreground also speak via existing voice singleton.
- Notification text: "Start OTP Pending — Please collect and enter the customer's Start OTP." Tap → `/start-booking/:id` (existing screen).
- Card indicator: "Start OTP Pending" → after 10 min "Start OTP Delayed — Enter OTP".
- Stops only on server-read `started_at`, cancel, reassign, terminal status. Typing an OTP never stops it.
- No changes to verify_start_otp, Complete OTP, dispatch, availability, payments. Failures swallowed.
- Tests: schedule math, eligibility, stop conditions, dedupe IDs.
- Requires a new Android build (new channel + mp3) — web-only update gives foreground-only reminders.

## Decisions needed
1. GO to build.
2. Voice file: OK to generate a synthetic "OTP! OTP! OTP!" mp3, or will you supply a recording?
3. Cap: stop after 2 hours of reminders?
4. Keep the existing 60-min End OTP reminder as is?
