# Start OTP Reminder — Stage 2 (test env) 2026-11-04

Nothing published. No production database or server function change. Stage 1 code (275 checks) intact.

## Step 1 — Android test APK: NOT BUILT, NOT TESTED ON A PHONE
The sandbox has no Java, Gradle, Android SDK or device. Every phone test below is **NOT VERIFIED**.

Build a debug APK (Windows/Mac/Linux with Java 21 + Android Studio, SDK 36):
```
git pull
npm install
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk
```
Debug builds install beside nothing on Play; uninstall the Play version first if signatures differ (that clears login — use a test phone). Do NOT upload to Play.

Prior audit flagged `BackendSync.kt` compile errors (undeclared variables). If `assembleDebug` fails there, that must be fixed first.

Unverified checklist (fill in on the phone):
| Test | Result |
|---|---|
| Voice clip clear, female, 3x "OTP" | NOT VERIFIED |
| 10-min first reminder, app open | NOT VERIFIED |
| 15/20/25-min repeats | NOT VERIFIED |
| Locked screen | NOT VERIFIED |
| Background | NOT VERIFIED |
| Swiped away | NOT VERIFIED |
| Battery saver (may be late) | NOT VERIFIED |
| Offline (reminders keep playing) | NOT VERIFIED |
| Phone restart (restored by plugin) | NOT VERIFIED |
| Notifications disabled (silent, card still shows) | NOT VERIFIED |
| Tap opens the right booking's Start OTP screen | NOT VERIFIED |
| Verify OTP → reminders stop (app open) | NOT VERIFIED |
| Server cancel push (needs Step 2 deployed) | NOT VERIFIED |

## Step 2 — Server-triggered cancel (built in app, server STAGED)
- Phone (new, in source): `StartOtpReminderCanceller.java` + a `START_OTP_REMINDER_CANCEL` branch in `MyFirebaseService`. It removes only stored reminders whose `kind = start_otp_reminder` AND `bookingId` equals the message's booking; ignores the message if `worker_uid` is for a different signed-in worker; also removes them from the plugin store so a reboot can't restore them. Repeat messages find nothing → safe. `BackendSync.resolveWorkerId` made non-private so Java can call it.
- Server (staged): trigger `trg_start_otp_reminder_cancel` on bookings sends one data-only push to the **old** worker when a Start OTP booking is verified, cancelled, completed, or reassigned. Never blocks the booking update.
- `send-fcm` needs a small change (see `reminder-server/send-fcm-handoff.md`): silent, 2-hour lifetime, server-set `worker_uid`.
- Missed / offline: FCM holds the message up to 2 h, then the phone's own 60-s sync on next open cancels. Force-stopped: Android already deleted the alarms; nothing plays. Reopen: app re-syncs from the server and clears anything stale.
- Remaining gap: phone offline for the whole 2 h AND never opened → reminders end by themselves at 2 h.

## Step 3 — Admin flags (STAGED)
Table `booking_start_otp_flags` (admin-read only), refreshed every minute by cron:
- 20 min → `delayed` = "Start OTP Delayed"; 2 h → `urgent_review` = "Start OTP Urgent Review".
- Resolved on verify / cancel / complete / reassign. Never cancels bookings or penalises workers.

## Step 4 — Safety
Files: `reminder-server/migration.sql`, `rollback.sql`, `mock_schema.sql`, `tests.sql`.
Throwaway local Postgres: **20/20 pass** (delayed/urgent timing, idempotent refresh, escalation, verify/cancel/reassign push scoped to booking + old worker, no repeat push, non-Start-OTP silent, push failure doesn't block, admin-only read, workers can't run refresh). Rollback ran clean.
Not touched: Complete OTP reminder, dispatch, payments, availability, verify_start_otp.
New Android permissions: **none** (POST_NOTIFICATIONS and RECEIVE_BOOT_COMPLETED already present; no exact-alarm).

## Needs your GO
1. Apply migration + cron. 2. Apply send-fcm change. 3. Admin Panel badge reading the new table. 4. Build test APK.
