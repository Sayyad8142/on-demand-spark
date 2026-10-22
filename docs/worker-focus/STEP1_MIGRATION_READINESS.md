# Step 1 — Diagnostic migration readiness (2026-10-22) — NOT APPLIED

Migration: `staged/001_worker_diagnostics_DRAFT.sql` · Rollback: `staged/001_worker_diagnostics_ROLLBACK.sql`
Rehearsal: `staged/rehearsal/run.sh` (throwaway local Postgres 17, never production) · Output: `staged/rehearsal/RESULTS.txt`

## Exact changes
Adds only: tables `worker_diagnostic_events`, `worker_diagnostic_status`; one index; function
`upsert_worker_diagnostic_status` (service role only); 2 admin read policies. Alters, updates or deletes nothing existing.

## Checks
| Check | Result | Evidence |
|---|---|---|
| Name conflicts in production | none (0 tables, 0 functions) | live read-only query |
| `workers.id` type uuid, `has_role(uuid, app_role)` exists | matches | live read-only query |
| Existing workers/bookings rows unchanged (apply, use, rollback) | unchanged (checksums equal) | rehearsal T1/T6 |
| New triggers on existing tables | 0 user triggers | rehearsal T6 |
| Delayed / equal-time report overwrites newer | refused | rehearsal T2 |
| Duplicate event | stored once | rehearsal T2 |
| Anonymous read/write | permission denied | rehearsal T3 |
| Signed-in non-admin read | 0 rows; write denied | rehearsal T4 |
| Admin read | allowed; write denied | rehearsal T5 |
| Rollback removes everything, data intact, re-apply works | yes | rehearsal |

## Who can write
Nobody writes directly. Workers submit only through the receiver, which verifies her Firebase login and picks her
worker record server-side (receiver tests 16/16). The receiver is a later step; until it exists nothing is written.

## Expected impact on live system
- Worker ON/OFF, eligibility, busy, bookings, dispatch, notifications, payments, payouts: no change.
- Foreign key to `workers` adds an internal delete check: deleting a worker also deletes her diagnostics. Creating it takes a brief lock on `workers` (milliseconds on 36 rows); run outside slot starts.
- Tables stay empty until the receiver is deployed and app sending is turned on.

## NOT VERIFIED
Rehearsal used stand-ins for Supabase roles/`auth.uid()`; real Admin Panel login → `has_role` must be checked after apply
with one admin and one non-admin account.

## Recommendation: GO for Step 1 only, on your approval. Receiver, app sending and publish remain NO-GO until separately approved.

---

# Corrected booking-confirmation receiver — deployment plan (NOT DEPLOYED)

Why push_received is missing: the live receiver is the old build and only stores "received" into
`booking_requests.push_delivered_at`; it never writes the booking timeline. "opened" is how popup/seen get through today.

Staged fix (`docs/ack-recovery/staged`, 24/24 tests pass now): accepts new names AND old names
(`received`, `opened`, `seen`, `popup`, `push_delivered`) and writes both the booking column and the timeline.

No interruption to popup_shown / seen:
- Phones with the fallback send the new name first → accepted at once; the legacy retry simply stops being needed.
- Older phones sending only old names → still accepted via aliases.
- Accept/reject are untouched; the receiver never assigns bookings.

Steps (see `docs/ack-recovery/DEPLOY_AND_ROLLBACK.md`): save live code + settings backup → approval → quiet window →
deploy with `verify_jwt=false` unchanged → probes (fake worker = 403, injection = 400) → within 30 min expect
`push_received` rows in the timeline and popup/seen continuing → rollback to backup if probes 5xx or confirmations drop.
Blocker: live source backup not yet exported (Admin Panel access needed).
