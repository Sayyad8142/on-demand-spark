# Field test prep — notification & availability (2026-11-04)

## Fixed in app (SOURCE)
- Sign-in for a returning worker no longer forces Available OFF / Busy OFF (OtpVerify upsert no longer sends `is_available`/`is_busy`).

## Verified in source, no change needed
- Token rotation: native `onNewToken` (MyFirebaseService) + JS `registration` listener (pushToken.ts) write `workers.fcm_token` for the session worker.
- Expired offers: `isFreshOffer` + `accept` RPC refuse expired/assigned offers.
- Busy (`is_busy`) is separate from `is_available`.
- Reconnect reminder: `RECONNECT_REMINDER_ENABLED` stays false.

## Blocker — needs owner GO (production server)
- `worker-health-watchdog` (cron every 2 min) still sets `is_available=false` on stale heartbeat (5 min) / missing token / misses, even though `dispatch.heartbeat_auto_offline_enabled = off`. This contradicts Fix 3.
- Proposed minimal fix: unschedule the watchdog cron (`select cron.unschedule('worker-health-watchdog')`), reversible by re-scheduling. APPLIED 2026-11-04 16:43 UTC with owner GO: `cron.alter_job(35, active := false)` (paused, not deleted). Resume: `select cron.alter_job(35, active := true);`
- Logout still sets Available OFF and clears the token (intentional: logged-out phone must not receive offers).

## Tests
- 287/287 pass. Android compile NOT VERIFIED (no JDK/SDK in sandbox).

## Real-device checks
Open / background / locked / app killed / network drop alerts; token after reinstall; sign-in keeps ON; warning when notifications are off.
