# Start OTP + End OTP production audit — 2026-11-01 (AUDIT ONLY, no changes)

Main project: paywwbuqycovjopryele. Labels: SOURCE (project code), LIVE (read-only DB query today), NOT VERIFIED.

## 1. End OTP (unchanged)
- Storage: `bookings.completion_otp`, 4 digits (LIVE, prior audit: all bookings have 4-digit codes). Worker reads exclude it (`WORKER_BOOKING_COLUMNS`).
- Validator: edge fn `complete-booking-with-otp` (SOURCE). Allowed statuses: assigned, accepted, on_the_way, started (line 11). Correct → booking completed; wrong → error, no change.
- Bypass protection (LIVE): `trg_enforce_server_completion_otp` blocks completion not done via the server check; `booking_status_transition_guard` enforces transitions. Workers have an UPDATE policy (`bookings_worker_update_assigned`), so these triggers are the only anti-bypass layer.
- Side effects (payouts/earnings/notifications): run from completion path per prior audits; not re-traced today.
- Live deployed function source: NOT VERIFIED (no management token; only project copy read).

## 2. Start OTP
- Storage: separate table `booking_start_otps` (hashed codes), `start_otp_releases`, `start_otp_config` (LIVE, exist).
- Config LIVE: enabled=false, max_attempts=5, 3 s between tries, 12 h expiry.
- Bookings: 995 total, 0 flagged `start_otp_required`, 0 codes, 0 started, 0 in progress.
- Triggers LIVE, enabled: `aab_start_otp_bookings_guard` (blocks started/completed without Start for flagged), `zza_start_otp_issue_on_assign` (new code on assign/reassign).
- Worker app cannot read codes (authenticated SELECT = false).
- Worker app SOURCE: `src/lib/startOtp.ts` → `rpc("verify_start_otp")`; button shown per booking flag; End screen redirects flagged unstarted bookings to Start.
- Why a separate table: `bookings` is readable/updatable by workers via RLS, so a Start code stored there could leak; separate locked table is required. Already built — nothing new needed.

## 3. Missing pieces
1. Customer (User App) must show the Start code — separate project, NOT VERIFIED.
2. Android 10.0.03 (build 103) must be built + installed. Live phones: 10.0.02 (26), 10.0.01 (4), 7.0.0 (4), 6.0.64 (3), 10.0.03 (1), 7.0.4 (1).
3. Live `complete-booking-with-otp` source match: NOT VERIFIED.

## 4. Compatibility
- Switch OFF: every booking unflagged → old apps work exactly as today.
- Switch ON: old apps have no Start button; flagged bookings cannot be completed by them (guard blocks) → workers stuck, not bypass. Turn on only after all active workers run 10.0.03.
- Bookings already assigned when switched on: stay unflagged (flag set at assignment) — finish on old flow.
- Website publish does not update phones (no server URL in Capacitor config).

## 5. Deployment sequence
1. Build + install 10.0.03 on all phones; confirm versions in `workers.app_version`.
2. Ship User App Start-code display.
3. Spare-phone test with one test booking.
4. `update start_otp_config set enabled = true;`
5. Watch first real bookings.

Rollback: `update start_otp_config set enabled = false;` (new bookings revert to End-only; flagged in-flight bookings still need Start or admin release via `admin_release_start_otp`).

## 6. Tests
245/245 Worker App tests pass. Android build: NOT RUN (no Android SDK here).

## Verdict
NO-GO to enable today. GO once steps 1–3 are done.
