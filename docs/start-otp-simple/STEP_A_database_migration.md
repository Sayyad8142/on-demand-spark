# Simple Start OTP — Step A: Database migration (v2, PREPARED, NOT EXECUTED ON PRODUCTION)

Labels: LIVE = read-only check on `paywwbuqycovjopryele` (28 Oct 2026). TESTED = disposable
Postgres 17 database with copies of the live triggers/policies. NOT VERIFIED = could not check.

Corrected SQL: `test-harness/01_migration.sql` (this is the exact text to submit on approval).
Tests: `test-harness/02_tests.sql` — **54/54 PASS**, results in `test-harness/test-results-2026-10-28.txt`.
Rollback: `test-harness/03_rollback.sql` — TESTED (rolled back, then re-applied cleanly).

## 1. Login method (answers to review points 1–2)

- SOURCE + LIVE: The Worker App signs in with **Supabase Auth** (`supabase.auth.signInWithOtp` /
  `signInWithPassword`, session in `AuthContext`). The "Firebase" memory notes are historical.
  LIVE: 35/35 active workers have a matching Supabase login (`auth.users.id = workers.user_id or workers.id`).
  `auth.uid()` worker lookup (`user_id = auth.uid()::text OR id = auth.uid()`) is the same one the live
  `accept_booking_authoritative`, `reject_booking_offer` and `complete-booking-with-otp` use. **Works.**
- LIVE: Customers: `get_profile_id()` resolves `profiles.firebase_uid = auth.uid()` or `profiles.id = auth.uid()`.
  Of 535 bookings in the last 30 days, **only 247 (46%) belong to a customer with a login on this
  backend**; 288 do not. The User App lives on a different project (`wvuuyrovdfydubmvsfxl`) and
  how it reads bookings/End codes here is NOT VERIFIED.
  => `get_my_start_otp()` alone is not enough. v2 adds `service_get_start_otp(booking, customer_profile)`
  callable **only by the service role**, for the User App's own server after it has verified the customer.
  Which of the two the User App uses is a Step C decision.

## 2. Changes from v1

| Review point | v1 | v2 |
|---|---|---|
| Storage | plaintext code | salted HMAC-SHA256 hash for checking + `pgp_sym_encrypt` copy for the customer; key in Vault (`start_otp_encryption_key`); table has no client grants |
| Expiry | none | `expires_at` (default 12 h, `ttl_minutes`); worker gets `EXPIRED`; customer view re-issues an expired code |
| Reassignment | re-issue | re-issue on any worker change (incl. direct swap), delete on unassign, attempts/lock reset |
| Proof of start | session setting `app.start_otp_ok` | **removed**. Trigger requires a row in the locked table with `verified_at` set for the current worker. LIVE: 13 public functions call `set_config`, so session settings are not a safe proof |
| Fake admin completion | allowed (`completion_source='admin'` was trusted) | Start-OTP bookings: admin completion only from server/service role or `is_admin()` |
| `started_at` | writable | silently kept unless a verified start happens |
| Insert as started/completed | allowed | refused for Start-OTP bookings |
| Flag `start_otp_required` | immutable | immutable except through `admin_release_start_otp` (recovery list) |
| Recovery | switch off only | `admin_reset_start_otp` (new code) + `admin_release_start_otp` (back to End-code-only) |
| Switch | admin UPDATE policy | no client UPDATE at all; SQL editor / service role only |

## 3. Bypass audit (TESTED)

Blocked for Start-OTP bookings: worker/customer direct `status='started'`; worker direct OTP
completion before start; worker/customer `completion_source='admin'`; clearing the flag;
setting `started_at`; forged session setting; insert as completed; other worker verifying;
previous worker after reassignment; reading the code table, the key or the service retrieval function.
Allowed (by design): admin End-code completion (`admin_complete_booking_with_otp`), admin/server
admin completion, cancellation.
Legacy bookings: no rule applies (guard returns at once).

Pre-existing gaps NOT fixed here (unchanged, outside Start OTP): workers can still OTP-complete
**legacy** bookings by direct write without the End code; customers can change `worker_id` on their
own booking; the End code has no attempt limit and uses `random()`.

## 4. Deployed End OTP function

- NOT VERIFIED: deployed source of `complete-booking-with-otp` could not be exported from here.
  Repo copy: service-role UPDATE to `completed` with `completed_by='worker'`, `completion_source='otp'`,
  `otp_verified_at`, filtered by worker and `status in COMPLETABLE_STATUSES`.
- TESTED with that exact write shape: legacy booking completes from `assigned` (unchanged); Start-OTP
  booking completes after start; Start-OTP booking before start is refused with a database error,
  which the function returns as HTTP 500 "Booking must be started with the Start code first".
- Effect while switch OFF: none (no booking is flagged). Before Step F the live source must be
  exported to `docs/deployed-snapshots/` and confirmed to include `started` in `COMPLETABLE_STATUSES`.

## 5. Risks remaining

| Risk | Level | Note |
|---|---|---|
| User App can't identify 54% of customers via `get_my_start_otp` | High for Step C, none for Step A | `service_get_start_otp` path ready; User App backend NOT VERIFIED |
| Deployed End function differs from repo | Medium | Only matters after switch ON |
| Production `postgres` is not superuser (test DB was) | Low | Functions are SECURITY DEFINER owned by `postgres`, which owns `bookings` and has Vault access on Supabase; confirm with the post-migration checks |
| Admin "set status = started" tool refused for Start-OTP bookings | Low | Intended; use reset or release |
| Customer view re-issue after expiry resets the lock | Low | Customer controls it; worker still needs the new code |
| 4-digit code (10,000 options) | Low | 5 tries then lock, 3 s spacing |

## 6. Rollback and recovery (TESTED)

1. **Soft:** `UPDATE start_otp_config SET enabled = false;` — new bookings are End-code-only.
2. **Bookings already needing a Start code:** `SELECT admin_release_start_otp(id, 'rollback') FROM bookings
   WHERE start_otp_required AND status NOT IN ('completed','cancelled');` — each moves to End-code-only,
   its Start code is deleted, and the deployed End function completes it normally (TESTED).
   Single stuck booking: `admin_reset_start_otp(id)` (new code) or `admin_release_start_otp(id)`.
3. **Full:** `test-harness/03_rollback.sql` (does 1 and 2 first, then removes everything incl. the Vault key).

## 7. Post-migration checks (read-only)
- `select count(*) from bookings where start_otp_required` = 0; `booking_start_otps` = 0 rows.
- Vault secret `start_otp_encryption_key` exists.
- As a worker session, `select * from booking_start_otps` → permission denied.
- Next real booking completes with End code as before.

## GO / NO-GO

- **Step A migration with switch OFF: GO** (conditional on your approval). It is additive, flags no
  booking, leaves End OTP/payments/payouts/wallet/dispatch/availability untouched, passed 54/54, and
  rolls back cleanly.
- **Turning the switch ON: NO-GO** until the User App customer path (Step C) is confirmed, the deployed
  End function is exported and checked, and a spare-phone test (Step E) passes.

## Production execution — 28 Oct 2026 ~13:05 UTC (LIVE)

- Pre-checks: no Start OTP objects existed; 957 bookings, 2 open; Vault extension present.
- Migration: **succeeded** (exact tested SQL).
- Switch: `enabled = false` (5 tries / 3 s / 720 min).
- Bookings flagged: 0 of 957. Start codes: 0. Releases: 0. Open bookings (1 pending, 1 assigned) unflagged, unchanged.
- Function access: as designed (helpers/key/service retrieval: service role only; worker check, customer view, admin reset/release: signed-in only; nobody signed-out).
  The read-only checker itself was refused access to the key function.
- **Unexpected:** this project's default privileges gave `anon` and `authenticated` table rights on the three new tables
  (the disposable test DB had none). RLS is ON with no client policies, so no rows can be read or written by apps today,
  but the intended second lock (no grants) is missing. Trigger functions are also executable by PUBLIC (cannot be
  called usefully outside a trigger). Not fixed — needs approval:
  `REVOKE ALL ON public.booking_start_otps, public.start_otp_releases FROM anon, authenticated;`
  `REVOKE INSERT, UPDATE, DELETE ON public.start_otp_config FROM anon, authenticated; REVOKE SELECT ON public.start_otp_config FROM anon;`
  `REVOKE EXECUTE ON FUNCTION public.start_otp_bookings_guard(), public.start_otp_issue_on_assign() FROM PUBLIC, anon, authenticated;`
- Vault key presence: NOT VERIFIED directly (secret reads are blocked for the checker); will be exercised the first time a code is issued (switch ON only).

## Permission cleanup (approved, prompt-31) — 2026-10-29

Pre-check: names, owners (postgres), RLS on, and grants matched the audit. Only difference: 3 new everyday bookings (960 total), none flagged.
Ran exactly the 4 approved REVOKE statements. No other permissions changed.

After:
- booking_start_otps / start_otp_releases: postgres + service_role only.
- start_otp_config: authenticated keeps SELECT; anon has no SELECT. Both still hold TRUNCATE/REFERENCES/TRIGGER/MAINTAIN (outside approved scope; PostgREST can't send TRUNCATE). Proposed follow-up: `REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.start_otp_config FROM anon, authenticated;`
- start_otp_bookings_guard / start_otp_issue_on_assign: postgres + service_role only. Both triggers still enabled (Postgres checks trigger function rights only when the trigger is created, not when it fires).
- verify_start_otp, get_my_start_otp, admin_reset_start_otp, admin_release_start_otp: signed-in users keep execute; signed-out users don't.
- Switch OFF; 0 flagged bookings; 0 codes; 0 releases.
