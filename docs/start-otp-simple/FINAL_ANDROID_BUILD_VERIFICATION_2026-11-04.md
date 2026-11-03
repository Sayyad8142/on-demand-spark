# Final Android Build Verification — 2026-11-04

Labels: SOURCE = read in code, TESTED = automated test run, NOT VERIFIED = needs build/phone.

## 1. Compilation fix (SOURCE)
The same ACK legacy-retry block (uses `event`, `bookingId`, `workerId`, `url`, `ackToken`) had been pasted into three functions in `BackendSync.kt` that do not declare those names:
- `pingBootSync` (fixed earlier)
- `reportMissedBooking` (fixed now)
- `sendHeartbeat` (fixed now)
Each now returns success on HTTP 2xx, as before the paste. The only remaining copy is in `sendAckHttp`, where every name is declared (correct, untouched).
Also checked: `StartOtpReminderCanceller.java` uses `BackendSync.INSTANCE.resolveWorkerId` (public), `WorkerLog.INSTANCE.add` (Kotlin object), and `TimedNotificationPublisher` (present in @capacitor/local-notifications 7, linked in capacitor.build.gradle).
Kotlin/Java compilation: NOT VERIFIED (no JDK/SDK in sandbox).

## 2. Build requirements and procedure
Java 21 (JDK), Android SDK platform 36 + build-tools, Gradle 8.11.1 via wrapper, AGP 8.9.2, Kotlin 1.9.24. versionCode 103 / 10.0.03.
```
git clone <repo> && cd <repo>
npm ci
npm run build
npx cap sync android          # regenerates capacitor.settings.gradle paths
cd android && ./gradlew clean assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```
Debug only. No release/bundle, no Play upload.

## 3. Reminder reliability
| Case | Intended | Evidence |
|---|---|---|
| Start OTP verified | reminders cancelled on next sync / cancel push | TESTED (rules) + PRIOR local SQL tests; device NOT VERIFIED |
| Booking cancelled | cancelled | TESTED rules; device NOT VERIFIED |
| Reassigned | old worker's cancelled (worker_uid checked) | TESTED rules + SQL; device NOT VERIFIED |
| Phone restart | cancelled reminders removed from store, not restored | SOURCE; device NOT VERIFIED |
| Background / locked | local notification with bundled sound | device NOT VERIFIED |
| Duplicates | stable IDs per booking+index; cancel idempotent | TESTED |
Known limit: with app closed and no cancel push, one stale reminder can fire.

## 4. Production integration (staged, NOT deployed)
- SQL: `reminder-server/migration.sql` (+ `rollback.sql`), cron commented out.
- send-fcm: `reminder-server/send-fcm-handoff.md`.
- Admin Panel needs: read `booking_start_otp_flags` (admin via has_role) joined to bookings/workers/communities; show booking id, worker name/phone, flat number, community, minutes since accept; badge "Start OTP Delayed" at level delayed (≥20 min), "Start OTP Urgent Review" at urgent_review (≥2 h); hide when resolved_at is set (auto on verify/cancel/complete/reassign).

## 5. GO / NO-GO
- Android compilation: CONDITIONAL — source fixed, build must pass on a real machine.
- Physical-device testing: NO-GO until done.
- Server readiness: READY (staged, tested locally), awaiting approval.
- Admin Panel: NOT STARTED (separate project).
- Rollback: READY (rollback.sql, revert send-fcm, unschedule cron; phone keeps working without server parts).
Automated: 275/275 frontend tests pass.
