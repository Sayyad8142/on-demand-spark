# Start OTP Missing — Read-only Audit (28 Oct 2026)

No code, deploy, publish, migration or setting changes. No real OTPs used; no bookings modified.
Labels: SOURCE = repo code, LIVE = read-only check on main server `paywwbuqycovjopryele`, NOT VERIFIED = could not check.

## Root cause
1. SOURCE: Worker Start flow is built but behind two switches, both OFF by default:
   `START_OTP_WORKER_ENABLED_DEFAULT = false` (src/lib/startOtp.ts:12) and
   `OTP_V2_CLIENT_ENABLED_DEFAULT = false` (src/lib/otpV2.ts:41).
   With both off, ActiveJobCard.tsx:79-81 uses the legacy action, so an `assigned` booking shows "Complete with OTP" (line 376). "Start Booking with OTP" (line 393) only renders when the switch is on and status is assigned/accepted/confirmed/on_the_way.
2. LIVE: The server has no Start code. `bookings` holds only `completion_otp` (+ `otp_verified_at`, `started_at`). No other table/column in any schema stores a Start code, hash, attempts or expiry.
3. LIVE: `completion_otp` is 4 digits (535/535 bookings, last 30 days), created at booking insert by trigger `trg_enforce_server_completion_otp`. So the "4-digit Start OTP" the User App shows is almost certainly this End code under a Start label (User App NOT ACCESSIBLE — NOT VERIFIED).
4. LIVE: `otp-v2-gateway` is deployed (unauthenticated call → 401 UNAUTHORIZED; verify_start without otp → 400 INVALID_REQUEST). Its behaviour for a real booking with a session is NOT VERIFIED; with no Start code stored, it cannot check one for a real booking.
5. Status is NOT misread as started: Flat 9198 (booking a2a7f3a6…) is `assigned`, `started_at` null, `reach_status` pending.

## Statuses
DB allows: pending, assigned, accepted, on_the_way, started, completed, cancelled, failed_no_worker. No `in_progress`.
Legacy path allows assigned → completed directly (0 of 23 completions in last 3 days have `started_at`).

## Impact of enforcing now
Only 1 open booking (Flat 9198, assigned). It has no Start code, so it must stay on the legacy flow.

## Proposed fix (needs approval)
- Backend: store hashed 4-digit Start code at assignment, separate from `completion_otp`; `otp-v2-gateway` verify_start sets `started`; completion refused unless started (server-side, incl. `complete-booking-with-otp` and direct writes); attempt limits; existing bookings stay legacy via resolve_mode.
- User App: show Start code before start; End code only after started.
- Worker App: turn the switch on once the above is live (one-line change). End OTP code path unchanged.
- Tests: spare-phone booking end-to-end (wrong code, lock, correct code, End code), legacy booking still completes, 226 unit tests.
