# Start OTP Reminder — Stage 2 Approval Report (2026-11-04)

Labels: SOURCE = checked in code, PRIOR = earlier session result, NOT VERIFIED = not run.

## Implemented this session
- Android compile fix (SOURCE): `BackendSync.pingBootSync` contained a pasted ACK-retry block using undeclared `bookingId`, `workerId`, `url`, `ackToken`. Removed it; the boot ping now returns success on HTTP 2xx, as it did before. No other Android behaviour changed. The ACK path (`postAck`) keeps its own legacy retry untouched.

## Already in place (PRIOR, Stage 2)
- Phone-side cancel handler `StartOtpReminderCanceller.java` + `START_OTP_REMINDER_CANCEL` branch in `MyFirebaseService` (worker_uid check, idempotent, removes from boot-restore store).
- Staged server SQL in `reminder-server/` (flags table, `refresh_start_otp_flags`, cancel trigger, cron commented out) — 20/20 local Postgres tests passed earlier, rollback clean. NOT applied to production.
- send-fcm change described in `reminder-server/send-fcm-handoff.md` — NOT applied (saving the function deploys it live).

## Automated tests
- 275/275 frontend tests pass (SOURCE, this session).
- Kotlin compile: NOT VERIFIED — no Java/Gradle/Android SDK in this sandbox.

## Not done here / needs owner
- Admin Panel badges (Delayed 20 min, Urgent Review 2 h, worker/booking/flat/community/elapsed): the Admin Panel is a separate project; the staged `booking_start_otp_flags` table provides the data. Build there after the migration is approved.
- Silent-push delivery/expiry/retry testing: needs a staging send-fcm and a real phone.
- Debug APK: NOT BUILT. Steps on a machine with Java 21 + Android SDK 36:
  `npm install && npm run build && npx cap sync android && cd android && ./gradlew assembleDebug`
  then `adb install -r app/build/outputs/apk/debug/app-debug.apk`.

## Physical-device checks still needed
Reminder sound at 10 min with app closed/locked; stops after Start OTP verified; stops on cancel/reassign via silent push; no extra sound on normal booking offers; reboot does not resurrect cancelled reminders.

## Untouched
Dispatch, priority, acceptance, availability, payments, verify_start_otp, Complete OTP.

## Deploy / rollback (after separate approval)
Deploy: apply migration → apply send-fcm change → enable cron → release APK. Rollback: `reminder-server/rollback.sql`, revert send-fcm, unschedule cron.
