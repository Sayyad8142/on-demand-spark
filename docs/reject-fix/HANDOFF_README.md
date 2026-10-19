# DIDI NOW — P0 reject fix handoff (for Admin Panel review)
Nothing here has been applied, deployed or published. Production untouched.

## Contents
reject-fix/
- P0_REJECT_AND_ACK_REPORT.md — first audit report
- EVIDENCE_FAILED_REJECTS_AND_ACKS.md — the 10 failed rejects, failing line, ACK evidence
- 000_reject_core_LIVE_BACKUP.sql — live `_reject_booking_request_core` (original + rollback copy)
- 001_reject_core_array_fix_DRAFT.sql — the fix (one statement changed)
- live_definitions/reject_wrappers_LIVE.sql — live `reject_booking_offer` + `reject_booking_request` (unchanged by fix)
- test_schema.sql — minimal tables/auth stubs to reproduce
- reject_core.offline.test.ts (7) + reject_flow.offline.test.ts (12) — run with bun + @electric-sql/pglite
- test-results/*.txt — actual output of the runs in this package
ack-recovery/ — staged corrected `ack-booking-delivery` (index.ts + handler.ts), 24 tests, deploy/rollback doc
source/ — current repo ack function, Android reject code (BookingOverlayService.kt, BookingAlertActivity.kt), JS bookingActions.ts

## Old vs new APK reject endpoints
| | New APK (10.0.02 source) | Older APKs (seen live: Android 13/15 devices) |
|---|---|---|
| Call | POST /rest/v1/rpc/reject_booking_offer `{p_booking_id}` | POST /rest/v1/rpc/reject_booking_request `{p_booking_id,p_worker_id}` |
| Identity | worker from JWT only | JWT; supplied id must equal session worker, else `forbidden` |
| Path | → `_reject_booking_request_core` | → `reject_booking_offer` → core |
| Success shown when | `success && confirmed` | NOT VERIFIED (older APK source not available) |
Both reach the same broken statement, so one backend fix covers both.

## What the fix resolves / what remains
Resolves: every HTTP 400 "malformed array literal" — rejects inside the offer window now record `rejected`,
activate the next batch, stop the re-send loop.
Remains (by design, returns HTTP 200 with confirmed=false, not a 400):
- `offer-expired` — reject after timeout_at (60 s window). Current app shows "This offer has expired".
- `offer-closed` — offer already timed out / marked unreachable / lost.
- `booking-already-accepted` — another worker won.
- Older APKs may still show a generic failure for these (message text NOT VERIFIED; "Got reject fail" is not in this repo).

## Tests actually executed (offline, in-memory Postgres, not an isolated Supabase project)
19/19 reject tests + 24/24 ACK tests pass — see test-results/. Covered: last worker in batch with next batch waiting,
within 60 s, after 60 s, after re-send, repeated, after another accept, old + new endpoints, foreign worker id, no session;
ACK: push_received / popup_shown accepted (old + new names), dedupe, ownership, injection guard.
NOT executed: true concurrent accept+reject (two connections), a real Supabase copy, real phones, live triggers
on booking_requests (8 triggers; checked live — none use arrays).

## Dependencies
Functions: `_reject_booking_request_core`, `reject_booking_offer`, `reject_booking_request`, `auth.uid()`, `auth.jwt()`.
Tables/columns: bookings(id,status); booking_requests(id,booking_id,worker_id,status,responded_at,order_sequence,offered_at,timeout_at,created_at); workers(id,user_id).
Grants live: core = no anon/authenticated; both wrappers = authenticated only.

## Deployment order (each step needs owner approval)
1. Admin Panel review of this package.
2. Apply `001_reject_core_array_fix_DRAFT.sql` (seconds; no data change).
3. Verify: next real Reject → HTTP 200 + booking_requests.status='rejected'; postgres_logs show no new
   "malformed array literal"; grants unchanged (`has_function_privilege`); offer not re-sent to that worker.
4. Separately deploy staged `ack-booking-delivery` (docs in ack-recovery/DEPLOY_AND_ROLLBACK.md), verify_jwt=false.
5. Watch 24 h: rejected count > 0, device ACKs > 0 when push_sent > 0.

## Rollback
Reject: run `000_reject_core_LIVE_BACKUP.sql` (restores the broken but previous behaviour; no data change).
ACK: redeploy the owner's dashboard backup of the original function.
Neither touches Accept, assignment, OTP, payments or payouts.
