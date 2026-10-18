# DIDI NOW — Phase 1 Critical OTP Fix: draft report (18 Oct 2026)
Nothing applied, deployed or published. No booking, OTP or payout touched.
Files: `001_completion_lock_DRAFT.sql`, `completion_lock.offline.test.ts`.

## 1. Root cause
The `bookings` table lets the assigned worker (`bookings_worker_update_assigned`) and the customer (`bookings_update_own_firebase`) update their booking row. `guard_booking_completion_source` only checks *labels* (`completion_source='otp'`, `completed_by='worker'`, `otp_verified_at` set) — anyone allowed to update can write them. `guard_booking_sensitive_fields` does not protect `status` or those labels, and does not apply to customers at all. Completion fires two payout triggers. (LIVE-READ definitions.)

## 2. Completion paths
| Path | Who | Status |
|---|---|---|
| Direct table update (worker policy) | assigned worker | **VULNERABLE** |
| Direct table update (customer policy) | booking customer | **VULNERABLE** (also can change `completion_otp`) |
| `complete-booking-with-otp` edge function | worker via service_role, checks token/assignment/OTP/state | Legit — keep |
| `admin_complete_booking_with_otp` | admin (`is_admin()` check) | Legit, but labels itself `completed_by='worker'` and no audit |
| `admin_set_booking_status` | admin/service_role check | Legit, no audit |
| Admin direct update (`bookings_update_admin_authenticated_only`) | admin | Legit, no audit |
| `update_booking_status` | lets worker set any status | Not executable by app users today (LIVE-READ); revoke again |
| `trg_create_payout_on_payment_collected` | fires only on already-completed rows | Safe once completion is locked |
| Worker App client | only calls the edge function (SOURCE) | Safe |
| Customer app / Admin Panel | other projects | NOT VERIFIED |

## 3. Proposed change (draft SQL)
New BEFORE UPDATE trigger `aaa1_guard_booking_completion_lock`. Unless the caller is service_role, a direct DB session, or `is_admin()`:
- moving a booking into `completed` is refused;
- changes to `completion_source`, `completed_by`, `otp_verified_at`, `completed_at`, `completion_otp` are refused;
- re-opening a completed booking is refused.
Admin completions (not service_role) are written to `booking_events` as `admin_completion` with the admin's id. `update_booking_status` execute is revoked again.

## 4. End OTP impact
None expected: the edge function uses service_role and passes; checks of worker, assignment, OTP, state and duplicate completion stay as they are (TEST: completes once, duplicate gives no row).

## 5. Payout impact
Payouts can only start from trusted completions. Legit flow still creates exactly one payout (TEST). No payout code changed.

## 6. Offline tests — 15/15 pass
Real Postgres in memory (PGlite), modelling the live policies, guard and payout trigger. Before the fix, 2 tests prove a worker and a customer can forge completion + payout. After: forgery refused with no payout; labels/OTP edits refused; legacy RPC refused; normal worker edits work; edge-function path, admin RPC and admin direct update work; admin completions are logged; re-open refused; other workers/anon blocked.
Limits: a model, not the full production schema (other triggers absent).

## 7. Database test status
NOT RUN — no isolated test project; only production is connected. Stopped before database testing as instructed.

## 8. Rollback
Drop the trigger and its two functions (statements at the bottom of the draft). Takes seconds, no data change.

## 9. Before production
1. Isolated copy of the database; apply draft; run the same 15 scenarios plus End OTP on a real booking.
2. Confirm Customer app and Admin Panel never complete bookings or edit completion fields as normal users (they would start failing — intended).
3. Confirm any cron/SQL job that completes bookings runs as service_role or postgres.
4. Device test: complete a booking with OTP on 10.0.02.
5. Your separate approval.
Not in this phase: hide `completion_otp` from workers, attempt limit/expiry, Start OTP, and `admin_complete_booking_with_otp` labelling itself as worker.

## 10. Verdict
Draft: **ready for isolated testing**. Production: **NO-GO** until steps 1–5 are done.
