# Worker App code review — 2026-11-07 (read-only, nothing changed)

Automated tests: 291/291 pass. Lint: clean. Android build: NOT VERIFIED (no SDK in sandbox).

## High
1. `send-fcm` only checks that an Authorization header exists (`supabase/functions/send-fcm/index.ts:65`), and `send-webpush` checks nothing. JWT verification is off for both in `supabase/config.toml`. Anyone can push fake booking alerts to workers. SOURCE, repo copy; live version NOT VERIFIED.
2. Hardcoded 20% fee (breaks the "currently 0%, never hardcode" rule): `Earnings.tsx:99` (`gross * 0.2` for estimated payouts) and `CompleteBooking.tsx:643` plus en/hi/te "Platform Fee (20%)" label.
3. Secrets in logs: OTP code (`OtpVerify.tsx:123,136`), full FCM token (`Settings.tsx:131`), JWT first 50 chars (`AuthBridge.java:34`), access/refresh token fragments (`BookingOverlayService.kt` 7 sites), whole push payload incl. ack_token (`fcm.ts:32,99`, `native/push.ts:56,68,82`).

## Medium
4. Accept lock is separate for the pop-up (native) and the in-app card (JS), so both can send an accept for the same booking (`BookingOverlayService.kt:522`, `bookingAlertCoordinator.ts:88`). Server decides the winner; duplicate request only.
5. When accept returns "taken"/failure, the offer is still dismissed (`useUnifiedBookingAlerts.ts:273`) — fine for "taken", wrong for retryable errors.
6. Native pop-up failure not caught: `showBookingOverlay` not awaited (`useUnifiedBookingAlerts.ts:79`), so the fallback never runs if it rejects.
7. Movement tracking can restart after the booking ended (async continuation in `App.tsx:387-416`; `stepMonitoring.ts:361-415`), and isn't stopped on logout.
8. `BootReceiver.kt:61` starts `LocationTrackingService`, which is not declared in the manifest — dead/crashing path (and location is against the Android policy rule).
9. Push health reports "healthy" when phone and server tokens differ (`pushToken.ts:186-207`).
10. Ringtone MediaPlayer leaks if prepare/start throws (`BookingOverlayService.kt:1350`).
11. Late listener leak in `useWorkerHeartbeat.ts:43-56`; unhandled rejection from `initNativePush` (`App.tsx:425`).

## Clean-up
- 14 unused files: lib/androidOverlay, backgroundLocation, foregroundService, oemHints; hooks/useBookingAlerts, useHeartbeat, useRealtimeBookings, useVerifiedAppOpen; components/BookingCard, CommunitySelector, Header, IncompleteBankSetup, NotificationHealthWarning, ReachabilityBanner. Note: the after-7 PM change in useBookingAlerts.ts is in a file nothing uses (harmless; the live path is useUnifiedBookingAlerts).
- Root scripts with real worker phone numbers: audit_workers.ts, debug_lookup.ts, verify_sid.ts; TEST_BOOKING_FLOW.sql creates real bookings if run.
- Home runs 4 overlapping offer checks (two polls, realtime on two tables); deduped by the coordinator, extra battery/data use.
- 118 `as any` casts in 57 files; ~39 `text-white` and 21 hex colours outside the theme.
- Big files: Auth.tsx 1112, Profile.tsx 921, App.tsx 784 lines.

## Security scan (lov_pgscan, 2026-11-07)
10 errors, ~40 warnings. Errors: public read on worker_ratings, flats, events_ingestion, academy_quiz_questions, academy_lesson_targets; open insert on worker_presence_snapshots; any signed-in user can change worker_emergency_pause and read/write worker_ops_case_events; signed-in read on start_otp_config and worker_training_video_settings (these two are intended). Warnings: 13 security-definer functions without fixed search_path, several open-insert lead/feedback tables. Shared database — tables may belong to the Admin/User apps.

## Proposed order (each step keeps the app working)
1. Remove secret logging (app + Android). Check: tests + grep.
2. Replace 20% with the community's configured fee. Check: new test for 0% → net = gross.
3. Lock down send-fcm / send-webpush — staged as a docs handoff (editing functions auto-deploys).
4. Fix accept flow items 4–6 with tests.
5. Fix tracking/boot/listener items 7–11.
6. Delete unused files and root scripts. Check: build + tests.
7. Security-scan policies — decide per table with Admin/User App owners.
