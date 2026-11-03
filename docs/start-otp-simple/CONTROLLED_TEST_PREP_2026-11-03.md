# Start OTP controlled production test — preparation (2026-11-03, read-only)

## Admin Panel controls (live DB; Admin Panel code not accessible from this workspace)
1. ON/OFF switch: NOT FOUND. No RPC writes `start_otp_config`; no update policy. Only the SQL editor (service role) can change it.
2. Identify old builds: PARTIAL. `workers.app_version` is reported; `build_number` is empty (incl. the 10.0.03 worker).
3. Block incompatible workers: NOT FOUND (no per-version dispatch filter). Only availability OFF, which we must not touch.
4. `admin_release_start_otp`: EXISTS, checks `is_admin()` (has_role admin) or server; execute granted to authenticated, guarded inside. Clears the flag, deletes the code, logs to `start_otp_releases`.
5. Monitoring: no dedicated screen found; SQL `select id,status,worker_id from bookings where start_otp_required` works.
- No booking-scoped test mechanism: `booking_test_flags` is unrelated to Start OTP.

## Isolation available (source-verified, not exercised live)
- Flag is copied from the switch only at booking INSERT and locked afterwards → a short ON window flags only bookings created inside it.
- Existing bookings, dispatch ranking, availability and payouts are not touched by the switch. Completion still produces the same `completed` status, so payouts are unchanged.
- Risk: a flagged booking can be offered to an older-app worker. Mitigation: release it or reassign.

## Procedure
1. On the test phone: Profile shows 10.0.03; DB `workers.app_version = '10.0.03'`.
2. Quiet time; tester is a staff/test customer account.
3. SQL editor: `update start_otp_config set enabled = true;`
4. Immediately create one booking in the User App, then SQL: `update start_otp_config set enabled = false;` (window under 1 min).
5. Check: `select id, start_otp_required from bookings where created_at > now() - interval '5 minutes';` — release any non-test row with `select admin_release_start_otp('<id>','not test');`.
6. Make sure the 10.0.03 worker gets the booking (accept the offer, or reassign from Admin Panel). If an older-app worker accepts → release.
7. Customer sees 4-digit Start code → worker enters it → status `started` → End OTP → `completed`. Check payout row as usual.
8. Leftovers: `select id,status from bookings where start_otp_required and status not in ('completed','cancelled');` → release each.

## Verdict
- Via Admin Panel: NO-GO (no switch, no version blocking).
- Via the short SQL window above: CONDITIONAL GO after owner approval and confirmation of the test phone's version. Recovery call exists and is admin-guarded but has not been run live.
